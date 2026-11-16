# Formularios · Culligan Biofy

Web con los formularios internos de Culligan Biofy (protegida con contraseña).

- `src/app.html`: la web (portada, formulario con firma, panel de respuestas).
- `forms/*.json`: un archivo por formulario.
- `scripts/build.mjs`: monta `index.html` con los formularios y las contraseñas cifradas.

Las respuestas se cifran en el navegador y se guardan en un repositorio **privado** aparte.
Aquí no hay datos, contraseñas ni tokens: solo bloques cifrados.
