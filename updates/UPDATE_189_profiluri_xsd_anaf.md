# UPDATE 189 - Profiluri XSD ANAF pe perioada

Versiune: 2.12.168 -> 2.12.169

- XSD sau ZIP inspectat automat: namespace, element radacina, versiune si atribute obligatorii.
- Perioada de valabilitate, ordinul si URL-ul oficial sunt pastrate cu fiecare schema.
- Resolverul alege profilul aplicabil lunii declarate, nu doar ultimul fisier incarcat.
- Candidatul XML retine profilul de schema folosit si ramane blocat pana la acceptarea validatorului.
- Nu se afirma depunerea oficiala fara rezultat acceptat de programul de validare aplicabil.
- Migrare: `db/migrations/046_anaf_schema_profiles.sql`.
