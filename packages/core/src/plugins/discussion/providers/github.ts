import type { VaultObject } from "../../../types.js";
import type {
  GitHubDiscussionConfig,
  DiscussionLink,
  CreateDiscussionOptions,
  CreateDiscussionResult,
  ValidationResult,
} from "../types.js";
import { BaseDiscussionPlugin } from "./base.js";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface RepositoryInfo {
  repository: {
    id: string;
    discussionCategories: {
      nodes: Array<{ id: string; name: string }>;
    };
  };
}

interface DiscussionSearchResult {
  search: {
    nodes: Array<{
      __typename: string;
      id: string;
      title: string;
      url: string;
      body: string;
    }>;
  };
}

interface CreateDiscussionMutation {
  createDiscussion: {
    discussion: {
      id: string;
      url: string;
    };
  };
}

export class GitHubDiscussionPlugin extends BaseDiscussionPlugin {
  name = "github";
  displayName = "GitHub Discussions";

  private getToken(config: GitHubDiscussionConfig): string | undefined {
    return config.token ?? process.env.GITHUB_TOKEN;
  }

  async validate(config: GitHubDiscussionConfig): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!config.repo) {
      errors.push("repo is required (format: owner/repo)");
    } else if (!config.repo.includes("/")) {
      errors.push("repo must be in format owner/repo");
    }

    if (!config.category) {
      errors.push("category is required");
    }

    const token = this.getToken(config);
    if (!token) {
      errors.push("token or GITHUB_TOKEN environment variable is required");
    }

    return { valid: errors.length === 0, errors };
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    token: string
  ): Promise<GraphQLResponse<T>> {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "extenote-discussion-plugin",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<GraphQLResponse<T>>;
  }

  private async getRepositoryInfo(
    owner: string,
    repo: string,
    token: string
  ): Promise<{ repoId: string; categoryId: string | null; categories: string[] }> {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          discussionCategories(first: 25) {
            nodes {
              id
              name
            }
          }
        }
      }
    `;

    const result = await this.graphql<RepositoryInfo>(query, { owner, repo }, token);

    if (result.errors?.length) {
      throw new Error(`GitHub API error: ${result.errors[0].message}`);
    }

    if (!result.data?.repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const categories = result.data.repository.discussionCategories.nodes;

    return {
      repoId: result.data.repository.id,
      categoryId: null, // Will be resolved by caller
      categories: categories.map((c) => c.name),
    };
  }

  private async findCategoryId(
    owner: string,
    repo: string,
    categoryName: string,
    token: string
  ): Promise<string> {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          discussionCategories(first: 25) {
            nodes {
              id
              name
            }
          }
        }
      }
    `;

    const result = await this.graphql<RepositoryInfo>(query, { owner, repo }, token);

    if (result.errors?.length) {
      throw new Error(`GitHub API error: ${result.errors[0].message}`);
    }

    const categories = result.data?.repository.discussionCategories.nodes ?? [];
    const category = categories.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (!category) {
      const available = categories.map((c) => c.name).join(", ");
      throw new Error(
        `Category "${categoryName}" not found. Available: ${available}`
      );
    }

    return category.id;
  }

  async exists(
    object: VaultObject,
    config: GitHubDiscussionConfig
  ): Promise<DiscussionLink | null> {
    const token = this.getToken(config);
    if (!token) return null;

    const [owner, repo] = config.repo.split("/");
    const title = this.getTitle(object);

    // Search for existing discussion by title in the repo
    const query = `
      query($searchQuery: String!) {
        search(query: $searchQuery, type: DISCUSSION, first: 5) {
          nodes {
            ... on Discussion {
              __typename
              id
              title
              url
              body
            }
          }
        }
      }
    `;

    const searchQuery = `repo:${owner}/${repo} in:title "${title}"`;

    try {
      const result = await this.graphql<DiscussionSearchResult>(
        query,
        { searchQuery },
        token
      );

      if (result.errors?.length) {
        return null;
      }

      const discussions = result.data?.search.nodes ?? [];
      const match = discussions.find(
        (d) => d.__typename === "Discussion" && d.title === title
      );

      if (match) {
        return {
          provider: this.name,
          url: match.url,
          uri: match.id,
          createdAt: new Date().toISOString(), // We don't have exact date from search
        };
      }
    } catch {
      // Search failed, assume doesn't exist
    }

    return null;
  }

  async create(options: CreateDiscussionOptions): Promise<CreateDiscussionResult> {
    const config = options.config as GitHubDiscussionConfig;
    const { object, dryRun } = options;

    const token = this.getToken(config);
    if (!token) {
      return { success: false, error: "No GitHub token available" };
    }

    // Check if already exists
    const existing = await this.exists(object, config);
    if (existing) {
      return { success: true, link: existing, skipped: true };
    }

    const [owner, repo] = config.repo.split("/");
    const title = this.getTitle(object);
    const body = this.getBody(object);

    if (dryRun) {
      return {
        success: true,
        link: {
          provider: this.name,
          url: `https://github.com/${config.repo}/discussions/new`,
          createdAt: new Date().toISOString(),
        },
      };
    }

    try {
      // Get repository ID and category ID
      const repoInfo = await this.getRepositoryInfo(owner, repo, token);
      const categoryId = await this.findCategoryId(owner, repo, config.category, token);

      // Create the discussion
      const mutation = `
        mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
          createDiscussion(input: {
            repositoryId: $repositoryId,
            categoryId: $categoryId,
            title: $title,
            body: $body
          }) {
            discussion {
              id
              url
            }
          }
        }
      `;

      const result = await this.graphql<CreateDiscussionMutation>(
        mutation,
        {
          repositoryId: repoInfo.repoId,
          categoryId,
          title,
          body,
        },
        token
      );

      if (result.errors?.length) {
        return { success: false, error: result.errors[0].message };
      }

      const discussion = result.data?.createDiscussion.discussion;
      if (!discussion) {
        return { success: false, error: "Failed to create discussion" };
      }

      return {
        success: true,
        link: {
          provider: this.name,
          url: discussion.url,
          uri: discussion.id,
          createdAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
