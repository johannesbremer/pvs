# Wie man das deutsche PVS-Chaos in eine Ontologie überführt

Dieses Repository dokumentiert den Versuch, aus dem historisch gewachsenen deutschen PVS-Ökosystem ein explizites, formales und testbares Modell zu rekonstruieren.

Praxisverwaltungssysteme in Deutschland sind kein kohärentes System, sondern ein historisch gewachsenes Geflecht aus Schnittstellen, Dateiformaten und Referenzimplementierungen. Sie kommunizieren über eine große Anzahl technischer Standards, die nicht zusammen entwickelt wurden, sondern über viele Jahrzehnte historisch gewachsen sind. Diese sind unter [update.kbv.de](https://update.kbv.de/ita-update/) öffentlich dokumentiert. Dort finden sich mehr als 3,2 Millionen Zeilen XML, unter ihnen viele Beispieldateien. Es ist auch eine große Anzahl an Java-Programmen als Referenzimplementierungen verschiedener Standards zu finden.

Die Frage ist deshalb nicht nur, wie man diese Standards konsumiert. Die interessantere Frage ist: Wie rekonstruiert man daraus ein formales Modell?

Mein erster Schritt war, diesen Datensatz in einem [Repository](https://github.com/johannesbremer/kbv-mirror) zu spiegeln und mit einigen Transformationen zugänglicher zu machen. ZIP-Dateien werden entpackt und PDFs wo möglich nach Markdown transformiert. Das ermöglicht Menschen und KI-Agenten mit normalen Unix-Werkzeugen diesen Datensatz untersuchen können.

Das allein erzeugt aber noch kein Verständnis. Die eigentliche Schwierigkeit liegt nicht in der Sichtbarkeit der Dateien, sondern in der Rekonstruktion ihres Verhaltens. In diesem Ökosystem steckt die Semantik nicht nur in Spezifikationen, sondern auch in Beispieldaten und Referenzcode. Wer kompatibel sein will, muss nicht nur Dokumente lesen, sondern Verhalten treffen.

Genau hier wird Property-based Testing interessant. Statt sich auf einige von Hand gepflegte Ein- und Ausgabepaare zu verlassen, beschreibt man allgemeine Eigenschaften, die für alle gültigen Eingaben gelten sollen. Die Orakel dafür sind die vorhandenen Referenzimplementierungen. Werkzeuge wie `fast-check` generieren automatisch viele Testfälle, finden Verletzungen dieser Eigenschaften und reduzieren Gegenbeispiele meist auf einen kleinen, analysierbaren Fehlerfall.

So lässt sich das Verhalten historischer Standards nicht nur dokumentieren, sondern (Bug für Bug) reproduzieren. Das Problem endet aber nicht bei Validierung. Die meisten populären Validierungsbibliotheken prüfen Daten nur in eine Richtung. Für ein System wie das deutsche PVS-Ökosystem reicht das nicht. Wer Semantik ernsthaft modellieren will, muss Daten nicht nur validieren, sondern zwischen Repräsentationen transformieren können.

Genau deshalb sind Bibliotheken wie `serde` in `Rust` oder `effect/Schema` in `Effect.ts` so interessant. Sie erlauben bidirektionale Transformation und Validierung. Und weil `effect/Schema` zu `JavaScript` kompiliert, können wir dies mit Ende-zu-Ende-Typsicherheit von der Schnittstelle (z.B. eRezept) über die Datenbank z.B. mittels `@effect/sql-drizzle` oder [Confect](https://confect.dev/) bis in den Browser z.B. mittels [TanStack Form](https://tanstack.com/form/latest/docs/framework/react/guides/validation#standard-schema-libraries) gewährleisten.

Das ist mehr als Typsicherheit als Selbstzweck. Es ist der Versuch, zentrale Quellen von Inkorrektheit schon im Inner Loop auszuschließen, bevor sie sich als Integrationsfehler, UI-Inkonsistenz oder falsche Persistenz im System festsetzen.

Aber selbst ein solcher Wissensgraph ist noch nicht die ganze Antwort. Ein Wissensgraph beschreibt, was man weiß. Die Ontologie geht darüber hinaus. Eine Ontologie ist ein gemeinsames, formal beschriebenes Modell eines realen Systems. Sie legt fest, welche Objekte existieren, wie sie zusammenhängen, welche Zustände sie haben und welche Bedeutung diese Zustände im Betrieb besitzen. Vor allem beschreibt sie nicht nur Daten, sondern auch erlaubte Aktionen: wer was tun darf, unter welchen Bedingungen und mit welchen Zustandsänderungen.

Und genau da wird aus PVS-Integration eine viel grundsätzlichere Aufgabe. Denn in der Praxis geht es nicht nur darum, XML korrekt zu parsen. Es geht darum, Rechte, Rollen, Übergänge und Schnittstellenverhalten so zu modellieren, dass sie in jeder Oberfläche und an jeder Integrationskante konsistent bleiben.

Hier kommen `Convex` und die Erweiterung mit Effect-Primitiven in `Confect` ins Spiel. `Confect` erlaubt es, Datenbankinteraktionen inklusive Zugriffskontrolle in Effect.ts zu formulieren. Damit wird aus verstreuter Geschäftslogik ein explizites Modell von Zuständigkeiten und erlaubten Operationen. Es ist die Formalisierung der Frage: Wer darf wann was?

Diese Frage endet nicht am Backend. Sie betrifft jede Schnittstelle und jede Benutzeroberfläche: vom eRezept bis zur Onlineterminvergabe, vom internen Praxisworkflow bis zum Telefon-KI-Agenten. Wenn dieselbe Ontologie überall greift, entstehen Synchronisation und Konsistenz nicht mehr durch Konvention, sondern durch ein gemeinsames Modell mit klar definierten Dateneinsichten und Veränderungen.

Das eigentliche Ziel ist also nicht, das deutsche PVS-Chaos nur besser zu integrieren. Das Ziel ist, seine implizite Semantik explizit zu machen.
