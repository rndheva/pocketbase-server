/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1912072331",
        "max": 0,
        "min": 0,
        "name": "event_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_893801496",
        "help": "",
        "hidden": false,
        "id": "relation794192745",
        "maxSelect": 0,
        "minSelect": 0,
        "name": "bus",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_1630916145",
        "help": "",
        "hidden": false,
        "id": "relation1985410363",
        "maxSelect": 0,
        "minSelect": 0,
        "name": "trip",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_2656792838",
        "help": "",
        "hidden": false,
        "id": "relation3109426870",
        "maxSelect": 0,
        "minSelect": 0,
        "name": "stop",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "help": "",
        "hidden": false,
        "id": "select639797634",
        "maxSelect": 0,
        "name": "jenis",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "board",
          "alight"
        ]
      },
      {
        "help": "",
        "hidden": false,
        "id": "date569656868",
        "max": "",
        "min": "",
        "name": "waktu",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "autodate2990389176",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate3332085495",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_158784136",
    "indexes": [],
    "listRule": null,
    "name": "passenger_events",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_158784136");

  return app.delete(collection);
})
