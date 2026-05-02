plugins {
    id("org.cyclonedx.bom")
}

tasks.named<org.cyclonedx.gradle.CycloneDxTask>("cyclonedxBom") {
    includeConfigs.set(listOf("runtimeClasspath"))
    outputName.set("sbom")
    outputFormat.set("json")
    componentVersion.set(project.version.toString())
}

tasks.named("build") {
    dependsOn("cyclonedxBom")
}
