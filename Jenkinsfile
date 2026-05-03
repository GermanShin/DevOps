pipeline {
    agent any

    environment {
        PATH = "/opt/homebrew/bin:${env.PATH}"
        DTRACK_URL = "http://localhost:8081"
        DTRACK_API_KEY = credentials('dtrack-api-key')
        DTRACK_PROJECT_UUID = credentials('dtrack-angular-project-uuid')
        DTRACK_DS_SAMPLE_SERVICE1_PROJECT_UUID = credentials('dtrack-ds-sample-service1-project-uuid')
        DTRACK_DS_SAMPLE_SERVICE2_PROJECT_UUID = credentials('dtrack-ds-sample-service2-project-uuid')
    }

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

        stage('ds-backend: Build') {
            steps {
                dir('app/ds-backend') {
                    sh './gradlew build'
                }
            }
        }

        stage('ds-backend: Upload SBOM') {
            steps {
                dir('app/ds-backend') {
                    sh './gradlew uploadBomToDependencyTrack'
                }
            }
        }
    }
}
