pipeline {
    agent any

    environment {
        PATH = "/opt/homebrew/bin:${env.PATH}"
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
