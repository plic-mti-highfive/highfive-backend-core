import {
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

/**
 * Stockage objet (MinIO en dev, S3 en production). Les fichiers ne transitent
 * jamais par la base : seule la cle d'objet y est conservee.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /**
   * Meme compte, adresse publique : une URL signee couvre l'hote qu'elle
   * vise, et le navigateur n'atteint le stockage que par son adresse
   * publique (`minio:9000` n'existe que dans le reseau Docker). La signature
   * se calcule sans appel reseau : ce client n'envoie jamais rien.
   */
  private readonly signer: S3Client;
  private readonly bucket: string;
  private readonly publicEndpoint: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('storage.bucket')!;
    this.publicEndpoint =
      config.get<string>('storage.publicEndpoint') ??
      config.get<string>('storage.endpoint')!;

    const options = {
      region: config.get<string>('storage.region'),
      credentials: {
        accessKeyId: config.get<string>('storage.accessKeyId')!,
        secretAccessKey: config.get<string>('storage.secretAccessKey')!,
      },
      forcePathStyle: config.get<boolean>('storage.forcePathStyle'),
    };
    this.client = new S3Client({
      ...options,
      endpoint: config.get<string>('storage.endpoint'),
    });
    this.signer = new S3Client({ ...options, endpoint: this.publicEndpoint });
  }

  /**
   * Cree le seau au demarrage s'il n'existe pas, et l'ouvre en lecture anonyme
   * sur les prefixes servis publiquement.
   *
   * Sans cela, l'application demarre mais tout depot echoue, et les avatars
   * pointent vers des URL refusees : le contrat rend ces URL directement
   * lisibles (`avatar` est une URL, et R-F4 rend publics les fichiers d'un
   * projet public). Une etape manuelle a faire avant chaque installation est
   * une etape qu'on oublie.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Seau « ${this.bucket} » cree.`);
      } catch (error) {
        // Le stockage peut etre indisponible au demarrage : l'API doit servir
        // tout le reste malgre tout.
        this.logger.warn(
          `Seau « ${this.bucket} » indisponible: ${String(error)}`,
        );
        return;
      }
    }

    await this.allowPublicReads();
  }

  /** Lit un objet en entier (images de quelques Mo au plus). */
  async read(key: string): Promise<Buffer> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!object.Body) throw new Error(`Objet ${key} vide`);
    return Buffer.from(await object.Body.transformToByteArray());
  }

  /** Depose un contenu et renvoie sa cle et son URL publique. */
  async put(
    folder: string,
    originalName: string,
    body: Buffer,
    mimeType: string,
  ): Promise<{ key: string; url: string }> {
    const extension = originalName.includes('.')
      ? `.${originalName.split('.').pop()!.toLowerCase()}`
      : '';
    const key = `${folder}/${randomUUID()}${extension}`;
    await this.putAt(key, body, mimeType);
    return { key, url: `${this.publicEndpoint}/${this.bucket}/${key}` };
  }

  /** Depose sous une cle choisie : une variante rangee a cote de son original. */
  async putAt(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );
  }

  /**
   * L'echec de suppression d'objet ne fait pas echouer la requete : la ligne
   * est deja supprimee cote base, et un objet orphelin est moins grave qu'une
   * suppression qui semble echouer alors qu'elle a eu lieu.
   */
  async remove(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        `Objet ${key} non supprime du stockage: ${String(error)}`,
      );
    }
  }

  /**
   * Supprime tout ce qui est range sous un prefixe (purge d'un projet ou
   * d'un compte), y compris les objets qu'aucune ligne ne reference plus.
   * Contrairement a `remove`, un echec est leve : l'appelant garde alors
   * ses lignes pour reessayer au passage suivant, plutot que de perdre la
   * trace d'objets restes dans le seau.
   */
  async removePrefix(prefix: string): Promise<number> {
    // Le `/` final evite que `projects/abc` emporte `projects/abcd`.
    const folder = prefix.endsWith('/') ? prefix : `${prefix}/`;
    let removed = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: folder,
          ContinuationToken: token,
        }),
      );
      const keys = (page.Contents ?? []).flatMap((object) =>
        object.Key ? [{ Key: object.Key }] : [],
      );
      if (keys.length > 0) {
        const result = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys, Quiet: true },
          }),
        );
        if (result.Errors?.length) {
          throw new Error(
            `${result.Errors.length} objet(s) non supprime(s) sous ${folder}`,
          );
        }
        removed += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return removed;
  }

  urlFor(key: string): string {
    return `${this.publicEndpoint}/${this.bucket}/${key}`;
  }

  /**
   * Lecture temporaire d'un objet hors des prefixes publics (pieces jointes
   * de messages). `fileName` est rendu au telechargement plutot que la cle
   * aleatoire.
   */
  signedUrlFor(
    key: string,
    ttlSeconds: number,
    fileName: string,
  ): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      }),
      { expiresIn: ttlSeconds },
    );
  }

  /**
   * Lecture signee d'une image affichee a chaque visite (personnalisation
   * des fiches). Une URL signee change avec l'heure de signature : resignee
   * a chaque lecture, la meme image aurait une adresse neuve a chaque
   * chargement et ne serait jamais servie depuis le cache du navigateur.
   * On signe donc avec le debut de la fenetre courante, et pour deux
   * fenetres : l'URL reste identique toute une fenetre, et une URL copiee
   * cesse de fonctionner au plus tard deux fenetres apres.
   */
  stableSignedUrlFor(
    key: string,
    windowSeconds: number,
    now: Date = new Date(),
  ): Promise<string> {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { signingDate: new Date(windowStart), expiresIn: 2 * windowSeconds },
    );
  }

  /**
   * Lecture anonyme limitee aux deux prefixes que l'API publie. Le reste du
   * seau reste ferme : ouvrir la racine exposerait tout depot futur par defaut.
   */
  private async allowPublicReads(): Promise<void> {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [
            `arn:aws:s3:::${this.bucket}/avatars/*`,
            `arn:aws:s3:::${this.bucket}/projects/*`,
          ],
        },
      ],
    };

    try {
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify(policy),
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Politique de lecture publique non appliquee: ${String(error)}`,
      );
    }
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
