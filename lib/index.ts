import cdk = require('@aws-cdk/core');

import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { Construct, Aws, CfnOutput } from '@aws-cdk/core';

export interface SimpleWebUIProps {
  /**
   * Name of the CloudFront deployment
   */
  deploymentName?: string;

  /**
   * Aliases for accessing your distribution
   */
  aliases?: string[];

  /**
   * Additional origins for your distribution
   */
  origins?: cloudfront.CfnDistribution.OriginProperty[];

  /**
   * Cache behaviors for the origins
   */
  cacheBehaviors?: cloudfront.CfnDistribution.CacheBehaviorProperty[];

  /**
   * Certificate to use. Required if using aliases
   */
  acmCertificateArn?: string
}

export class SimpleWebUI extends Construct {
  
  /** @returns the website bucket */
  public readonly websiteBucket: s3.Bucket;

  /** @returns the website distribution */
  public readonly websiteDistribution: cloudfront.CfnDistribution;

  /** @returns the website origin access identity */
  public readonly websiteOAI: cloudfront.CfnCloudFrontOriginAccessIdentity;

  constructor(scope: Construct, id: string, props: SimpleWebUIProps) {
    super(scope, id);

    // Create the OAI
    const comment = props.deploymentName || `Cloudmod deployment, simple-web-ui module.`;
    this.websiteOAI = new cloudfront.CfnCloudFrontOriginAccessIdentity(this, 'WebsiteOAI', {
      cloudFrontOriginAccessIdentityConfig: {
        comment
      }
    });

    // Create the S3 bucket
    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket');

    // Configure the bucket policy
    this.websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
      principals: [new iam.CanonicalUserPrincipal(this.websiteOAI.attrS3CanonicalUserId)],
      actions: [
        's3:GetObject',
        's3:ListBucket'
      ],
      resources: [
        this.websiteBucket.bucketArn,
        this.websiteBucket.arnForObjects('*')
      ]
    }));

    // Create the cloudfront distribution
    const origins: cloudfront.CfnDistribution.OriginProperty[] = [];
    origins.push({
      id: 'default',
      domainName: this.websiteBucket.bucketDomainName,
      s3OriginConfig: {
        originAccessIdentity: `origin-access-identity/cloudfront/${this.websiteOAI.ref}`
      }
    });
    origins.push.apply(origins, props.origins || []);

    this.websiteDistribution = new cloudfront.CfnDistribution(this, 'WebsiteDistribution', {
      distributionConfig: {
        aliases: props.aliases,
        priceClass: 'PriceClass_100',
        enabled: true,
        comment,
        defaultCacheBehavior: {
          minTtl: 0,
          defaultTtl: 5,
          maxTtl: 5,
          targetOriginId: 'default',
          viewerProtocolPolicy: 'redirect-to-https',
          forwardedValues: {
            queryString: true
          }
        },
        cacheBehaviors: props.cacheBehaviors,
        defaultRootObject: 'index.html',
        customErrorResponses: [
          {
            errorCode: 404,
            responseCode: 200,
            responsePagePath: '/'
          }
        ],
        origins,
        viewerCertificate: {
          acmCertificateArn: props.acmCertificateArn,
          sslSupportMethod: 'sni-only'
        }
      }
    });

    // Configure output
    new CfnOutput(scope, 'SimpleWebUIBucket', { value: this.websiteBucket.bucketName });
  }
}
