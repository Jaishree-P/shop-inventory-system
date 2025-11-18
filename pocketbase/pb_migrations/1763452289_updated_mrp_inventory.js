/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2264338198")

  // add field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "number238408899",
    "max": null,
    "min": 0,
    "name": "opening",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "bool3407633853",
    "name": "openingLocked",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "number2469551104",
    "max": null,
    "min": 0,
    "name": "mrpPrice",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "number1343271194",
    "max": null,
    "min": 0,
    "name": "inward",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "number3478180368",
    "max": null,
    "min": 0,
    "name": "transferred",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "number1803644996",
    "max": null,
    "min": 0,
    "name": "sales",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2264338198")

  // remove field
  collection.fields.removeById("number238408899")

  // remove field
  collection.fields.removeById("bool3407633853")

  // remove field
  collection.fields.removeById("number2469551104")

  // remove field
  collection.fields.removeById("number1343271194")

  // remove field
  collection.fields.removeById("number3478180368")

  // remove field
  collection.fields.removeById("number1803644996")

  return app.save(collection)
})
