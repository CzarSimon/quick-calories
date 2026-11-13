/// <reference path="../pb_data/types.d.ts" />

// Per-user settings: macro defaults/floors (g/kg), redistribution cap,
// fallback body weight, microcycle definition and nudge times.

const OWN = "user = @request.auth.id";
const CREATE = '@request.auth.id != "" && @request.body.user = @request.auth.id';
const UPDATE = OWN + " && (@request.body.user:isset = false || @request.body.user = @request.auth.id)";
const DATE = "^\\d{4}-\\d{2}-\\d{2}$";
const TIME = "^([01]\\d|2[0-3]):[0-5]\\d$";

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const settings = new Collection({
      type: "base",
      name: "settings",
      listRule: OWN,
      viewRule: OWN,
      createRule: CREATE,
      updateRule: UPDATE,
      deleteRule: OWN,
      fields: [
        { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "number", name: "protein_target_gkg", required: true, min: 0 },
        { type: "number", name: "protein_floor_gkg", required: true, min: 0 },
        { type: "number", name: "fat_target_gkg", required: true, min: 0 },
        { type: "number", name: "fat_floor_gkg", required: true, min: 0 },
        { type: "number", name: "carb_floor_gkg", required: true, min: 0 },
        { type: "number", name: "max_daily_change_pct", required: true, min: 0, max: 100 },
        { type: "number", name: "fallback_weight_kg", min: 0 },
        { type: "number", name: "microcycle_length_days", required: true, min: 1, max: 28, onlyInt: true },
        { type: "text", name: "microcycle_anchor_date", required: true, pattern: DATE },
        { type: "text", name: "nudge_evening_time", pattern: TIME },
        { type: "text", name: "nudge_morning_time", pattern: TIME },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX `idx_settings_user` ON `settings` (`user`)"],
    });
    app.save(settings);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("settings"));
  },
);
