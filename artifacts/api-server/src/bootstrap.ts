import { bindStagingDatabaseTarget } from "./lib/staging-database-target";

bindStagingDatabaseTarget(process.env);

await import("./index");