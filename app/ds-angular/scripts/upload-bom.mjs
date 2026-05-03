import { readFileSync } from 'fs';

const url = process.env.DTRACK_URL ?? error('DTRACK_URL environment variable is not set');
const apiKey = process.env.DTRACK_API_KEY ?? error('DTRACK_API_KEY environment variable is not set');
const projectUuid = process.env.DTRACK_PROJECT_UUID ?? error('DTRACK_PROJECT_UUID environment variable is not set');

function error(message) {
    console.error(message);
    process.exit(1);
}

const bomFile = 'dist/sbom.json';
const encodedBom = readFileSync(bomFile).toString('base64');
const payload = JSON.stringify({ project: projectUuid, bom: encodedBom });

const response = await fetch(`${url}/api/v1/bom`, {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
    },
    body: payload,
});

if (!response.ok) {
    console.error(`Upload to Dependency Track failed: HTTP ${response.status} — ${await response.text()}`);
    process.exit(1);
}

console.log(`BOM uploaded to Dependency Track (HTTP ${response.status})`);
