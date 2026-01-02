/**
 * Provider Exports
 *
 * Imports all providers to register them, then re-exports utilities.
 */

// Import providers to trigger registration
import "./dblp.js";
import "./semantic-scholar.js";
import "./openalex.js";
import "./crossref.js";

// Re-export base utilities
export {
  registerProvider,
  getProvider,
  getAvailableProviders,
  hasProvider,
  BaseProvider,
  AutoProvider,
} from "./base.js";

// Re-export individual providers
export { dblp, DblpProvider } from "./dblp.js";
export { semanticScholar, SemanticScholarProvider } from "./semantic-scholar.js";
export { openalex, OpenAlexProvider } from "./openalex.js";
export { crossref, CrossrefProvider } from "./crossref.js";
