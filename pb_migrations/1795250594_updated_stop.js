/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2656792838")

  // update collection data
  unmarshal({
    "name": "stops"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2656792838")

  // update collection data
  unmarshal({
    "name": "stop"
  }, collection)

  return app.save(collection)
})
