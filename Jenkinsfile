pipeline {
    agent any

    stages {
        stage('ds-angular: Check Environment Variables') {
            steps {
                sh '''
                    echo "DTRACK_URL: $DTRACK_URL"
                    echo "DTRACK_API_KEY is set: $([ -n "$DTRACK_API_KEY" ] && echo yes || echo no)"
                    echo "DTRACK_PROJECT_UUID is set: $([ -n "$DTRACK_PROJECT_UUID" ] && echo yes || echo no)"
                '''
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
