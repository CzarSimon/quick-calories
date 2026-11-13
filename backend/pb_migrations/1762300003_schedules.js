/// <reference path="../pb_data/types.d.ts" />

// Schedules: one plan per microcycle day, each with timed slots of planned items.

const OWN = "user = @request.auth.id";
const CREATE = '@request.auth.id != "" && @request.body.user = @request.auth.id';
const UPDATE = OWN + " && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";
const TIME = "^([01]\\d|2[0-3]):[0-5]\\d$";

// A reference to another owned record must point at one of the caller's own records.
// Names prefixed with "*" are multi-relations: every referenced record must be owned.
function refRule(field) {
  if (field.startsWith("*")) {
    const f = field.slice(1);
    return `(@request.body.${f}:isset = false || @request.body.${f}:length = 0 || @request.body.${f}.user = @request.auth.id)`;
  }
  return `(@request.body.${field}:isset = false || @request.body.${field} = "" || @request.body.${field}.user = @request.auth.id)`;
}

function owned(users, name, fields, indexes, refs) {
  const refRules = (refs || []).map(refRule);
  return new Collection({
    type: "base",
    name,
    listRule: OWN,
    viewRule: OWN,
    createRule: [CREATE, ...refRules].join(" && "),
    updateRule: [UPDATE, ...refRules].join(" && "),
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
    const labels = app.findCollectionByNameOrId("labels");
    const foods = app.findCollectionByNameOrId("foods");
    const meals = app.findCollectionByNameOrId("meals");

    // Exactly one active schedule per user is enforced by the app.
    const schedules = owned(
      users,
      "schedules",
      [
        { type: "text", name: "name", required: true, max: 120 },
        { type: "relation", name: "labels", collectionId: labels.id, maxSelect: 50, cascadeDelete: false },
        { type: "bool", name: "is_active" },
        { type: "number", name: "adjustment_kcal", onlyInt: true },
        { type: "select", name: "adjustment_mode", required: true, maxSelect: 1, values: ["even", "custom"] },
      ],
      ["CREATE INDEX `idx_schedules_user` ON `schedules` (`user`)"],
      ["*labels"],
    );
    app.save(schedules);

    // macro_overrides: {protein_gkg?, fat_gkg?, carbs_g?}; a missing key means "derive".
    const dayPlans = owned(
      users,
      "day_plans",
      [
        { type: "relation", name: "schedule", required: true, collectionId: schedules.id, maxSelect: 1, cascadeDelete: true },
        { type: "number", name: "day_index", min: 0, max: 27, onlyInt: true },
        { type: "number", name: "kcal", required: true, min: 0, onlyInt: true },
        { type: "json", name: "macro_overrides", maxSize: 2000 },
        { type: "number", name: "accepted_imbalance_kcal", onlyInt: true },
        { type: "bool", name: "adjustment_included" },
        { type: "number", name: "adjustment_custom_kcal", onlyInt: true },
      ],
      ["CREATE UNIQUE INDEX `idx_day_plans_schedule_day` ON `day_plans` (`schedule`, `day_index`)"],
      ["schedule"],
    );
    app.save(dayPlans);

    const planSlots = owned(
      users,
      "plan_slots",
      [
        { type: "relation", name: "day_plan", required: true, collectionId: dayPlans.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "name", required: true, max: 80 },
        { type: "text", name: "time", required: true, pattern: TIME },
        { type: "select", name: "kind", required: true, maxSelect: 1, values: ["planned", "open"] },
        { type: "bool", name: "notify" },
        { type: "number", name: "sort", onlyInt: true },
      ],
      ["CREATE INDEX `idx_plan_slots_day_plan` ON `plan_slots` (`day_plan`)"],
      ["day_plan"],
    );
    app.save(planSlots);

    // Exactly one of food / meal is set (validated in the app).
    const planSlotItems = owned(
      users,
      "plan_slot_items",
      [
        { type: "relation", name: "slot", required: true, collectionId: planSlots.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "food", collectionId: foods.id, maxSelect: 1, cascadeDelete: false },
        { type: "relation", name: "meal", collectionId: meals.id, maxSelect: 1, cascadeDelete: false },
        { type: "number", name: "quantity", required: true, min: 0 },
        { type: "number", name: "sort", onlyInt: true },
      ],
      ["CREATE INDEX `idx_plan_slot_items_slot` ON `plan_slot_items` (`slot`)"],
      ["slot", "food", "meal"],
    );
    app.save(planSlotItems);
  },
  (app) => {
    for (const name of ["plan_slot_items", "plan_slots", "day_plans", "schedules"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
