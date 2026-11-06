/// <reference path="../pb_data/types.d.ts" />

// Tracking: microcycles, day logs, logged slots and logged entries.
// Log entries keep a nutrition snapshot so library edits never rewrite history.

const OWN = "user = @request.auth.id";
const CREATE = '@request.auth.id != "" && @request.body.user = @request.auth.id';
const UPDATE = OWN + " && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";
const DATE = "^\\d{4}-\\d{2}-\\d{2}$";
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
    const foods = app.findCollectionByNameOrId("foods");
    const meals = app.findCollectionByNameOrId("meals");
    const schedules = app.findCollectionByNameOrId("schedules");
    const dayPlans = app.findCollectionByNameOrId("day_plans");
    const planSlots = app.findCollectionByNameOrId("plan_slots");

    // A `mesocycle` relation will be added together with the future mesocycles collection.
    const microcycles = owned(
      users,
      "microcycles",
      [
        { type: "text", name: "start_date", required: true, pattern: DATE },
        { type: "number", name: "length", required: true, min: 1, max: 28, onlyInt: true },
        { type: "number", name: "bw_kg", min: 0 },
        { type: "select", name: "bw_source", maxSelect: 1, values: ["healthkit", "previous", "manual"] },
        { type: "number", name: "cumulative_balance_kcal" },
        { type: "number", name: "unrecovered_kcal" },
        { type: "bool", name: "closed" },
      ],
      ["CREATE UNIQUE INDEX `idx_microcycles_user_start` ON `microcycles` (`user`, `start_date`)"],
    );
    app.save(microcycles);

    // base_targets / targets: {kcal, protein_g, fat_g, carbs_g}
    const dayLogs = owned(
      users,
      "day_logs",
      [
        { type: "text", name: "date", required: true, pattern: DATE },
        { type: "relation", name: "microcycle", required: true, collectionId: microcycles.id, maxSelect: 1, cascadeDelete: true },
        { type: "number", name: "day_index", min: 0, max: 27, onlyInt: true },
        { type: "relation", name: "schedule", collectionId: schedules.id, maxSelect: 1, cascadeDelete: false },
        { type: "relation", name: "day_plan", collectionId: dayPlans.id, maxSelect: 1, cascadeDelete: false },
        { type: "json", name: "base_targets", maxSize: 2000 },
        { type: "json", name: "targets", maxSize: 2000 },
        { type: "bool", name: "closed" },
      ],
      [
        "CREATE UNIQUE INDEX `idx_day_logs_user_date` ON `day_logs` (`user`, `date`)",
        "CREATE INDEX `idx_day_logs_microcycle` ON `day_logs` (`microcycle`)",
      ],
      ["microcycle", "schedule", "day_plan"],
    );
    app.save(dayLogs);

    const logSlots = owned(
      users,
      "log_slots",
      [
        { type: "relation", name: "day_log", required: true, collectionId: dayLogs.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "plan_slot", collectionId: planSlots.id, maxSelect: 1, cascadeDelete: false },
        { type: "text", name: "name", required: true, max: 80 },
        { type: "text", name: "time", required: true, pattern: TIME },
        { type: "select", name: "kind", required: true, maxSelect: 1, values: ["planned", "open"] },
        { type: "select", name: "status", required: true, maxSelect: 1, values: ["pending", "confirmed", "adjusted", "skipped"] },
        { type: "number", name: "sort", onlyInt: true },
      ],
      ["CREATE INDEX `idx_log_slots_day_log` ON `log_slots` (`day_log`)"],
      ["day_log", "plan_slot"],
    );
    app.save(logSlots);

    const logEntries = owned(
      users,
      "log_entries",
      [
        { type: "relation", name: "log_slot", required: true, collectionId: logSlots.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "food", collectionId: foods.id, maxSelect: 1, cascadeDelete: false },
        { type: "relation", name: "meal", collectionId: meals.id, maxSelect: 1, cascadeDelete: false },
        { type: "text", name: "name", required: true, max: 200 },
        { type: "number", name: "quantity", min: 0 },
        { type: "number", name: "kcal", min: 0 },
        { type: "number", name: "carbs_g", min: 0 },
        { type: "number", name: "protein_g", min: 0 },
        { type: "number", name: "fat_g", min: 0 },
        { type: "select", name: "origin", required: true, maxSelect: 1, values: ["planned", "adhoc"] },
        { type: "select", name: "source", required: true, maxSelect: 1, values: ["manual", "ai"] },
        { type: "number", name: "sort", onlyInt: true },
      ],
      ["CREATE INDEX `idx_log_entries_log_slot` ON `log_entries` (`log_slot`)"],
      ["log_slot", "food", "meal"],
    );
    app.save(logEntries);
  },
  (app) => {
    for (const name of ["log_entries", "log_slots", "day_logs", "microcycles"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
