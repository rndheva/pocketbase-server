/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1413193342")

  // update field
  collection.fields.addAt(3, new Field({
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
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1413193342")

  // update field
  collection.fields.addAt(3, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2656792838",
    "help": "",
    "hidden": false,
    "id": "relation3109426870",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "stop",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
