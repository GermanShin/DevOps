#!/usr/bin/env bash
# Downloads Corretto 21 and Tomcat locally, uploads both to S3.
# Usage: ./upload-build-artifacts.sh <bucket-name> <aws-profile>
set -euo pipefail

BUCKET="${1:?Usage: $0 <bucket-name> <aws-profile>}"
PROFILE="${2:?Usage: $0 <bucket-name> <aws-profile>}"
REGION="ap-southeast-2"

CORRETTO_VERSION="21.0.11.10.1"
TOMCAT_VERSION="10.1.55"
TOMCAT_MAJOR="10"

CORRETTO_FILE="amazon-corretto-${CORRETTO_VERSION}-linux-x64.tar.gz"
TOMCAT_FILE="apache-tomcat-${TOMCAT_VERSION}.tar.gz"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Creating S3 bucket: $BUCKET"
aws s3 mb "s3://${BUCKET}" \
  --region "$REGION" \
  --profile "$PROFILE" 2>/dev/null || echo "    (bucket already exists)"

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled \
  --profile "$PROFILE" --region "$REGION"

# Files already downloaded locally — upload directly from scripts directory
echo "==> Uploading to s3://${BUCKET}/artifacts/"
aws s3 cp "${SCRIPT_DIR}/${CORRETTO_FILE}" "s3://${BUCKET}/artifacts/${CORRETTO_FILE}" \
  --profile "$PROFILE" --region "$REGION"
aws s3 cp "${SCRIPT_DIR}/${TOMCAT_FILE}" "s3://${BUCKET}/artifacts/${TOMCAT_FILE}" \
  --profile "$PROFILE" --region "$REGION"

echo ""
echo "Done. Artifacts in s3://${BUCKET}/artifacts/"
echo "  Corretto : s3://${BUCKET}/artifacts/${CORRETTO_FILE}"
echo "  Tomcat   : s3://${BUCKET}/artifacts/${TOMCAT_FILE}"
echo ""
echo "Use these parameter values when deploying the CF stack:"
echo "  ArtifactsBucket=${BUCKET}"
echo "  CorrettoVersion=${CORRETTO_VERSION}"
echo "  TomcatVersion=${TOMCAT_VERSION}"
echo "  TomcatMajorVersion=${TOMCAT_MAJOR}"
