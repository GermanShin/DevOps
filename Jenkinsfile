pipeline {
    agent any

    stages {
        stage('ds-angular: Build') {
            steps {
                dir('app/ds-angular') {
                    sh 'npm install'
                    sh 'npm run build'
                }
            }
        }

        stage('ds-angular: Upload SBOM') {
            steps {
                dir('app/ds-angular') {
                    sh 'npm run upload-bom'
                }
            }
        }

        stage('ds-backend: Check Environment Variables') {
            steps {
                sh '''
                    echo "DTRACK_URL: $DTRACK_URL"
                    echo "DTRACK_API_KEY is set: $([ -n "$DTRACK_API_KEY" ] && echo yes || echo no)"
                    echo "DTRACK_DS_SAMPLE_SERVICE1_PROJECT_UUID is set: $([ -n "$DTRACK_DS_SAMPLE_SERVICE1_PROJECT_UUID" ] && echo yes || echo no)"
                    echo "DTRACK_DS_SAMPLE_SERVICE2_PROJECT_UUID is set: $([ -n "$DTRACK_DS_SAMPLE_SERVICE2_PROJECT_UUID" ] && echo yes || echo no)"
                '''
            }
        }
    }
}
