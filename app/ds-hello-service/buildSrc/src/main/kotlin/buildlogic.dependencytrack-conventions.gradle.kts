import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.Base64

plugins {
    id("org.cyclonedx.bom")
}

tasks.cyclonedxBom {
    includeConfigs.set(listOf("runtimeClasspath"))
    outputFormat.set("json")
    outputName.set("sbom")
}

tasks.named("build") {
    dependsOn(tasks.cyclonedxBom)
}

tasks.register("uploadBomToDependencyTrack") {
    dependsOn(tasks.cyclonedxBom)
    notCompatibleWithConfigurationCache("Reads environment variables at execution time")

    val bomFileProvider = tasks.cyclonedxBom.flatMap { task ->
        task.destination.map { dest -> dest.resolve("${task.outputName.get()}.json") }
    }

    doLast {
        val url = System.getenv("DTRACK_URL") ?: error("DTRACK_URL environment variable is not set")
        val apiKey = System.getenv("DTRACK_API_KEY") ?: error("DTRACK_API_KEY environment variable is not set")
        val projectUuid = System.getenv("DTRACK_PROJECT_UUID") ?: error("DTRACK_PROJECT_UUID environment variable is not set")

        val bomFile = bomFileProvider.get()
        require(bomFile.exists()) { "BOM file not found at ${bomFile.absolutePath}" }

        val encodedBom = Base64.getEncoder().encodeToString(bomFile.readBytes())
        val payload = """{"project": "$projectUuid", "bom":"$encodedBom"}"""

        val client = HttpClient.newHttpClient()
        val request = HttpRequest.newBuilder().uri(URI.create("$url/api/v1/bom"))
            .header("Content-Type", "application/json")
            .header("X-Api-Key", apiKey)
            .PUT(HttpRequest.BodyPublishers.ofString(payload))
            .build()

        val response = client.send(request, HttpResponse.BodyHandlers.ofString())
        check(response.statusCode() in 200..299) {
            "Upload to Dependency Track failed: HTTP ${response.statusCode()} — ${response.body()}"
        }

        if(response.statusCode() !in 200..299){
            error("Dependency-Track upload failed: HTTP ${response.statusCode()} - ${response.body()}")
        }

        logger.lifecycle("BOM uploaded to Dependency-Track (HTTP ${response.statusCode()})")
    }

}
