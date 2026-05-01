import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Application user; Auth.js account/session tables will reference this next. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
