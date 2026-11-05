/// <reference path="../pb_data/types.d.ts" />

// Personal food library: foods, meals (recipes built from foods) and labels.

const OWN = "user = @request.auth.id";
const CREATE = '@request.auth.id != "" && @request.body.user = @request.auth.id';
const UPDATE = OWN + " && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";

function owned(users, name, fields, indexes) {
  return new Collection({
    type: "base",
    name,
    listRule: OWN,
    viewRule: OWN,
    createRule: CREATE,
    updateRule: UPDATE,
    deleteRule: OWN,
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      ...fields,
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: indexes || [],
  });
}

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const foods = owned(
      users,
      "foods",
      [
        { type: "text", name: "name", required: true, max: 200 },
        { type: "number", name: "ref_amount", required: true, min: 0 },
        { type: "select", name: "unit", required: true, maxSelect: 1, values: ["g", "ml", "piece", "slice", "serving"] },
        { type: "number", name: "kcal", min: 0 },
        { type: "number", name: "carbs_g", min: 0 },
        { type: "number", name: "protein_g", min: 0 },
        { type: "number", name: "fat_g", min: 0 },
        { type: "select", name: "source", required: true, maxSelect: 1, values: ["manual", "ai"] },
        { type: "bool", name: "archived" },
      ],
      ["CREATE INDEX `idx_foods_user` ON `foods` (`user`)"],
    );
    app.save(foods);

    const meals = owned(
      users,
      "meals",
      [
        { type: "text", name: "name", required: true, max: 200 },
        { type: "text", name: "notes", max: 2000 },
        { type: "select", name: "source", required: true, maxSelect: 1, values: ["manual", "ai"] },
        { type: "bool", name: "archived" },
      ],
      ["CREATE INDEX `idx_meals_user` ON `meals` (`user`)"],
    );
    app.save(meals);

    // A food referenced by a meal cannot be deleted (required, no cascade): archive it instead.
    const mealItems = owned(
      users,
      "meal_items",
      [
        { type: "relation", name: "meal", required: true, collectionId: meals.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "food", required: true, collectionId: foods.id, maxSelect: 1, cascadeDelete: false },
        { type: "number", name: "quantity", required: true, min: 0 },
        { type: "number", name: "sort", onlyInt: true },
      ],
      ["CREATE INDEX `idx_meal_items_meal` ON `meal_items` (`meal`)"],
    );
    app.save(mealItems);

    const labels = owned(
      users,
      "labels",
      [
        { type: "text", name: "name", required: true, max: 60 },
        { type: "text", name: "color", max: 20 },
      ],
      ["CREATE UNIQUE INDEX `idx_labels_user_name` ON `labels` (`user`, `name`)"],
    );
    app.save(labels);
  },
  (app) => {
    for (const name of ["labels", "meal_items", "meals", "foods"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
