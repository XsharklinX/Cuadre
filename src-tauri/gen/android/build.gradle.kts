buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        // Kotlin 2.2.20, NO 1.9.25 ni una 2.2 mas baja.
        //
        // Por que se sube: con 1.9.25 el compilador solo sabe leer metadata de
        // Kotlin hasta la 2.0, asi que cualquier libreria compilada con 2.1+
        // rompe el build con "Class 'kotlin.Unit' was compiled with an
        // incompatible version of Kotlin". Ya paso con Play Billing 8, y va a
        // volver a pasar con el siguiente SDK que se actualice.
        //
        // Por que EXACTAMENTE 2.2.20: este proyecto usa AGP 8.11.0, y las
        // versiones 2.2.0–2.2.10 solo soportan AGP hasta 8.10.0. El soporte de
        // AGP 8.11.x empieza en la 2.2.20. Gradle 8.14.3 entra en rango
        // (7.6.3–8.14).
        //
        // NOTA: este directorio se regenera con `tauri android init` — si eso
        // ocurre, hay que volver a poner esta version.
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.20")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

