import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as kms from "aws-cdk-lib/aws-kms";
import * as cr from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { EnvConfig } from "../config";

interface RdsStackProps extends cdk.StackProps {
  cfg: EnvConfig;
  vpc: ec2.Vpc;
  rdsSg: ec2.SecurityGroup;
}

export class RdsStack extends cdk.Stack {
  public readonly db: rds.DatabaseInstance;
  public readonly dbSecret: rds.DatabaseSecret;

  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const { cfg, vpc, rdsSg } = props;

    // KMS key for encryption at rest
    const dbKey = new kms.Key(this, "DbKey", {
      enableKeyRotation: true,
      description: `${cfg.envName} RDS encryption key`,
      alias: `${cfg.envName}-rds-key`,
    });

    // Credentials stored in Secrets Manager — auto-generated password
    this.dbSecret = new rds.DatabaseSecret(this, "DbSecret", {
      username: "dsadmin",
      secretName: `${cfg.envName}/ds-app/db-credentials`,
    });

    // ── RDS PostgreSQL Instance ───────────────────────────────────────
    const pgVersion = rds.PostgresEngineVersion.of(
      cfg.rdsPostgresVersion,
      cfg.rdsPostgresVersion.split(".")[0]
    );

    // RDS PostgreSQL instance
    this.db = new rds.DatabaseInstance(this, "Primary", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: pgVersion,
      }),
      instanceType: new ec2.InstanceType(cfg.rdsInstanceClass),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [rdsSg],
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      multiAz: cfg.rdsMultiAz,
      storageEncrypted: true,
      storageEncryptionKey: dbKey,
      allocatedStorage: cfg.rdsAllocatedStorage,
      maxAllocatedStorage: cfg.rdsMaxAllocatedStorage,
      backupRetention: cdk.Duration.days(cfg.rdsBackupRetentionDays),
      preferredBackupWindow: cfg.rdsBackupWindow,
      preferredMaintenanceWindow: cfg.rdsMaintenanceWindow,
      deletionProtection: cfg.envName === "prod",
      deleteAutomatedBackups: cfg.envName !== "prod",
      removalPolicy:
        cfg.envName === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      databaseName: cfg.rdsDatabaseName,
      instanceIdentifier: `${cfg.envName}-ds-app-db`,
      enablePerformanceInsights: cfg.envName !== "dev",
      cloudwatchLogsExports: ["postgresql"],
      autoMinorVersionUpgrade: true,
    });

    // ── Snapshot on Deploy ────────────────────────────────────────────
    if (cfg.rdsSnapshotOnDeploy) {
      const snapshotOnDeploy = new cr.AwsCustomResource(
        this,
        "SnapshotOnDeploy",
        {
          onCreate: {
            service: "RDS",
            action: "createDBSnapshot",
            parameters: {
              DBInstanceIdentifier: this.db.instanceIdentifier,
              DBSnapshotIdentifier: `${cfg.envName}-ds-app-db-initial`,
            },
            physicalResourceId: cr.PhysicalResourceId.of(
              `${cfg.envName}-snapshot-on-deploy`
            ),
          },
          policy: cr.AwsCustomResourcePolicy.fromStatements([
            new iam.PolicyStatement({
              actions: ["rds:CreateDBSnapshot", "rds:AddTagsToResource"],
              resources: ["*"],
            }),
          ]),
        }
      );

      // Snapshot must wait until RDS is fully available
      snapshotOnDeploy.node.addDependency(this.db);
    }

    // ── Tags ──────────────────────────────────────────────────────────
    cdk.Tags.of(this).add("Environment", cfg.envName);
    cdk.Tags.of(this).add("Owner", "Dylan.Shin");
    cdk.Tags.of(this).add("Project", "ds-app");
  }
}
