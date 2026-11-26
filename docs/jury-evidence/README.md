# Procedencia y licencias de las evidencias

Los JSON conservan las respuestas literales, coordenadas y tiempos reales. En el
registro de Motor se omitió de la copia pública el campo opaco `thoughtSignature`;
no se modificó la respuesta textual. Los archivos originales completos permanecen
locales. Ningún JSON contiene fotos codificadas, tokens de acceso ni claves privadas.

- `pi5-photo-card.jpg` y `binding-error-before.jpg`: capturas de la app con
  [Raspberry Pi 5 Board.jpg](https://commons.wikimedia.org/wiki/File:Raspberry_Pi_5_Board.jpg),
  SimonWaldherr, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Usan la miniatura pública 1280×853; la app la recomprime a JPEG, agrega marcas
  y una ficha. Estas capturas derivadas se distribuyen bajo CC BY-SA 4.0.
  SHA-256 de entrada: `29c5e99fe2d9cc29b137301f5540bcbb23a5954ceef7c8e100988d4e0d4da688`.
- `homemade-result.jpg`: [Stripboardexample.jpg](https://commons.wikimedia.org/wiki/File:Stripboardexample.jpg),
  Alexander Jones / AlexJ, dominio público. SHA-256 de entrada:
  `d3361cb2585faeab41f43bc3048f35d3e978e47f94cd7aed2bbf83f473aec841`.
- `table-rejected.jpg`: [An empty table in a restaurant.jpg](https://commons.wikimedia.org/wiki/File:An_empty_table_in_a_restaurant.jpg),
  Shixart1985 / Nenad Stojković, [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/).
  Miniatura pública 960 px, recomprimida por la app; captura con interfaz superpuesta.
- La foto oblicua fallida se referencia sin redistribuir: [Raspberry Pi 5 Computer.jpg](https://commons.wikimedia.org/wiki/File:Raspberry_Pi_5_Computer.jpg),
  RetroEditor, CC BY 4.0, 3072×2304; SHA-256
  `f55f15b1453215bbed6f9e3691c24b417aea42b4514b4e0815e8609ed5577a3b`.
- El control promocional oficial se referencia, no se redistribuye:
  https://assets.raspberrypi.com/static/c671804c05a51efc4e3c2a1bdcbafbcf/e58b5/raspberry-pi-5.png
  SHA-256 `328bf630ffd2f8c10308aa8895cedf6b23fcd8ff45eff651f21175cde50a7ba5`.
- Las seis fotos oficiales de Motor se descargan por URL y hash desde
  `deployment/fixtures/official-backside-motor.json`; no se publican sus píxeles.
- `pi5-model.jpg`: captura del CAD oficial convertido, licencia MIT del modelo
  conservada en el paquete de catálogo; no es una prueba de reconocimiento físico.

Los nombres de archivo de entrada fueron neutrales y no se enviaron al modelo.
Los hashes `captureSHA256` de los JSON corresponden al JPEG creado por la app;
no se confunden con los hashes de los archivos descargados.
