import { bindPublishedDatabaseTarget } from "./lib/published-database-target";

bindPublishedDatabaseTarget(process.env);

await import("./index");