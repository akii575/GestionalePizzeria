@echo off
cd /d "C:\Users\matti\Desktop\Gestionale Pizzeria"
set "JAVA_HOME=C:\Users\matti\.jdk\jdk-25.0.2"
"%JAVA_HOME%\bin\java.exe" --enable-native-access=ALL-UNNAMED -jar "target\gestionale-pizzeria-0.0.1-SNAPSHOT.jar"