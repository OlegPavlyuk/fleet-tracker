import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  bigserial,
  index,
  customType,
} from 'drizzle-orm/pg-core';

// ── PostGIS custom types ───────────────────────────────────────────────────────
// Drizzle has no built-in PostGIS support. customType controls DDL generation.
// Actual spatial inserts/selects MUST use sql`` template literals in query helpers
// (ST_MakePoint for inserts, ST_AsGeoJSON for selects) — the fromDriver/toDriver
// stubs throw to enforce this at runtime.

type GeoPoint = { lat: number; lng: number };

const geometryPoint = customType<{ data: GeoPoint; driverData: string }>({
  dataType() {
    return 'GEOMETRY(POINT, 4326)';
  },
  toDriver(value: GeoPoint): string {
    // Inserts must use sql`ST_MakePoint(${lng}, ${lat})` — this path is unreachable
    return `SRID=4326;POINT(${value.lng} ${value.lat})`;
  },
  fromDriver(_value: string): GeoPoint {
    throw new Error('Use ST_AsGeoJSON in your query — raw WKB geometry is not supported');
  },
});

type GeoPolygon = GeoPoint[][];

const geometryPolygon = customType<{ data: GeoPolygon; driverData: string }>({
  dataType() {
    return 'GEOMETRY(POLYGON, 4326)';
  },
  toDriver(_value: GeoPolygon): string {
    return '';
  },
  fromDriver(_value: string): GeoPolygon {
    throw new Error('Use ST_AsGeoJSON in your query for polygon columns');
  },
});

// ── Tables ─────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const drones = pgTable('drones', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  model: text('model').notNull(),
  status: text('status', { enum: ['active', 'idle', 'offline'] })
    .notNull()
    .default('idle'),
  deviceTokenHash: text('device_token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const telemetry = pgTable(
  'telemetry',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    droneId: uuid('drone_id')
      .notNull()
      .references(() => drones.id, { onDelete: 'cascade' }),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    position: geometryPoint('position').notNull(),
    altitudeM: real('altitude_m').notNull(),
    headingDeg: real('heading_deg').notNull(),
    speedMps: real('speed_mps').notNull(),
    batteryPct: real('battery_pct').notNull(),
  },
  (table) => [
    index('telemetry_gist_position_idx').using('gist', table.position),
    index('telemetry_drone_ts_idx').on(table.droneId, table.ts),
  ],
);

export const zones = pgTable('zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  polygon: geometryPolygon('polygon').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Inferred types ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Drone = typeof drones.$inferSelect;
export type NewDrone = typeof drones.$inferInsert;
export type Telemetry = typeof telemetry.$inferSelect;
export type NewTelemetry = typeof telemetry.$inferInsert;
export type Zone = typeof zones.$inferSelect;
export type NewZone = typeof zones.$inferInsert;
