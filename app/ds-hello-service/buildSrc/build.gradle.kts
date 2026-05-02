plugins {
    `kotlin-dsl`
}

repositories {
    mavenCentral()
    gradlePluginPortal()
}

dependencies {
    implementation("org.cyclonedx:cyclonedx-gradle-plugin:1.10.0")
}
