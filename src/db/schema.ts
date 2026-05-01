import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Auth.js default Drizzle schema (PostgreSQL).
 * Table names match @auth/drizzle-adapter expectations.
 */
export const user = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const account = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<string>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    compoundKey: primaryKey({
      columns: [t.provider, t.providerAccountId],
    }),
  }),
);

export const session = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationToken = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => ({
    compoundKey: primaryKey({
      columns: [t.identifier, t.token],
    }),
  }),
);

export const authenticator = pgTable(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: boolean("credentialBackedUp").notNull(),
    transports: text("transports"),
  },
  (t) => ({
    compoundKey: primaryKey({
      columns: [t.userId, t.credentialID],
    }),
  }),
);

export const dexcomTokens = pgTable(
  "dexcom_tokens",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope"),
    tokenType: text("token_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdIdx: index("dexcom_tokens_user_id_idx").on(t.userId),
  }),
);

export const glucoseReadings = pgTable(
  "glucose_readings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    mgdl: integer("mgdl").notNull(),
    trend: text("trend"),
    trendRate: integer("trend_rate"),
    source: text("source").notNull().default("dexcom"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userObservedUnique: uniqueIndex("glucose_readings_user_observed_at_uq").on(
      t.userId,
      t.observedAt,
    ),
    userObservedIdx: index("glucose_readings_user_observed_at_idx").on(
      t.userId,
      t.observedAt,
    ),
  }),
);

export const stravaTokens = pgTable(
  "strava_tokens",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    athleteId: text("athlete_id"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope"),
    tokenType: text("token_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdIdx: index("strava_tokens_user_id_idx").on(t.userId),
  }),
);

export const activities = pgTable(
  "activities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("strava"),
    providerActivityId: text("provider_activity_id").notNull(),
    name: text("name"),
    activityType: text("activity_type"),
    sportType: text("sport_type"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    durationSec: integer("duration_sec"),
    distanceMeters: integer("distance_meters"),
    movingTimeSec: integer("moving_time_sec"),
    elapsedTimeSec: integer("elapsed_time_sec"),
    totalElevationGainMeters: integer("total_elevation_gain_meters"),
    averageHeartrate: integer("average_heartrate"),
    maxHeartrate: integer("max_heartrate"),
    averageWatts: integer("average_watts"),
    kilojoules: integer("kilojoules"),
    calories: integer("calories"),
    sourcePayload: text("source_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userProviderActivityUnique: uniqueIndex(
      "activities_user_provider_activity_uq",
    ).on(t.userId, t.provider, t.providerActivityId),
    userStartIdx: index("activities_user_start_at_idx").on(t.userId, t.startAt),
  }),
);

export const hourlySteps = pgTable(
  "hourly_steps",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    stepCount: integer("step_count").notNull(),
    source: text("source").notNull().default("apple_shortcuts"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userBucketSourceUnique: uniqueIndex("hourly_steps_user_bucket_source_uq").on(
      t.userId,
      t.bucketStart,
      t.source,
    ),
    userBucketIdx: index("hourly_steps_user_bucket_idx").on(t.userId, t.bucketStart),
  }),
);
