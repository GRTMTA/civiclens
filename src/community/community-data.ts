/**
 * Community data access.
 *
 * The repository has no community discussion tables yet — `reports` and
 * `report_comments` model Community observations against a specific Project,
 * which is a different thing from open discussion. So this module ships a
 * seeded source and keeps the surface area of the data contract narrow:
 * swapping in a Supabase-backed `CommunitySource` later requires no UI change.
 *
 * `isSampleContent` is exposed so the UI can say plainly that the discussion
 * shown is sample content rather than live resident activity.
 */

import {
  applyVote,
  buildCommentTree,
  selectPosts,
  type CommentNode,
  type CommunityComment,
  type CommunityPost,
  type FeedQuery,
  type NewCommentInput,
  type NewPostInput,
  type ProjectReference,
  type VoteState,
} from "./community-contract"

export type CommunitySource = {
  /** True when the returned content is seeded sample data, not resident activity. */
  readonly isSampleContent: boolean
  listPosts(query: FeedQuery): Promise<CommunityPost[]>
  getPost(postId: string): Promise<CommunityPost | null>
  listComments(postId: string): Promise<CommentNode[]>
  createPost(input: NewPostInput): Promise<CommunityPost>
  createComment(input: NewCommentInput): Promise<CommunityComment>
  votePost(postId: string, direction: 1 | -1): Promise<{ score: number; viewerVote: VoteState }>
  voteComment(
    commentId: string,
    direction: 1 | -1,
  ): Promise<{ score: number; viewerVote: VoteState }>
  /** Projects a resident can optionally relate a discussion to. */
  searchProjects(term: string): Promise<ProjectReference[]>
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString()
}

const SEED_PROJECTS: ProjectReference[] = [
  { id: "sample-ccl-expressway", name: "Cebu–Cordova Link Expressway" },
  { id: "sample-mandaue-bridge", name: "Mandaue–Mactan Bridge Rehabilitation" },
  { id: "sample-barangay-road", name: "Barangay Road Improvement" },
  { id: "sample-drainage-mabolo", name: "Mabolo Drainage Improvement" },
  { id: "sample-flood-control-butuanon", name: "Butuanon River Flood Control" },
  { id: "sample-transport-terminal", name: "South Bus Terminal Modernization" },
]

const SEED_POSTS: CommunityPost[] = [
  {
    id: "sample-post-1",
    title: "Why has the construction of this bridge stopped?",
    body: "I pass this area on the way to work and the equipment has not moved for a few weeks now. The barriers are still up and one lane is closed. Does anyone know whether this is a scheduled pause, or where residents can check the current schedule?",
    authorName: "CivicLens Resident",
    createdAt: hoursAgo(3),
    topic: "bridges",
    score: 184,
    commentCount: 4,
    viewerVote: 0,
    project: SEED_PROJECTS[1],
  },
  {
    id: "sample-post-2",
    title: "Anyone else notice the drainage project along this road?",
    body: "There is new concrete work along the roadside and the old canal cover has been replaced. I am curious what the finished design is supposed to look like, and whether the sidewalk will be restored afterwards.",
    authorName: "CivicLens Resident",
    createdAt: hoursAgo(9),
    topic: "flood-control",
    score: 96,
    commentCount: 2,
    viewerVote: 0,
    project: SEED_PROJECTS[3],
  },
  {
    id: "sample-post-3",
    title: "Where can we find the official budget for this project?",
    body: "The signboard lists a contractor and a completion date but the amount is hard to read from the road. Is the contract amount published somewhere residents can look up, so we are reading the official record instead of guessing?",
    authorName: "CivicLens Resident",
    createdAt: hoursAgo(21),
    topic: "local-government",
    score: 143,
    commentCount: 3,
    viewerVote: 0,
    project: null,
  },
  {
    id: "sample-post-4",
    title: "This road improvement project looks almost complete",
    body: "Most of the surface has been paved and the line markings went in this week. Sharing an observation for anyone tracking this stretch — the shoulder near the corner still looks unfinished.",
    authorName: "CivicLens Resident",
    createdAt: hoursAgo(30),
    topic: "roads",
    score: 71,
    commentCount: 2,
    viewerVote: 0,
    project: SEED_PROJECTS[2],
  },
  {
    id: "sample-post-5",
    title: "Does anyone know when this flood-control project is expected to finish?",
    body: "The riverbank work has been going on for a while. Last rainy season the water still reached the road, so I am interested in what the official completion date is and what the project is scoped to cover.",
    authorName: "CivicLens Resident",
    createdAt: hoursAgo(44),
    topic: "flood-control",
    score: 128,
    commentCount: 3,
    viewerVote: 0,
    project: SEED_PROJECTS[4],
  },
  {
    id: "sample-post-6",
    title: "What happens to the old terminal building during the rebuild?",
    body: "Passengers are being routed through a temporary area and it gets crowded in the afternoon. Wondering whether the temporary arrangement is part of the published plan or something that changed on site.",
    authorName: "CivicLens Resident",
    createdAt: hoursAgo(58),
    topic: "transportation",
    score: 54,
    commentCount: 1,
    viewerVote: 0,
    project: SEED_PROJECTS[5],
  },
  {
    id: "sample-post-7",
    title: "How do residents read a project signboard properly?",
    body: "A short guide would help. I can see a contract identifier and dates but I am not sure which of those describe the official record and which describe the contractor's own schedule.",
    authorName: "CivicLens Resident",
    createdAt: hoursAgo(76),
    topic: "infrastructure",
    score: 112,
    commentCount: 2,
    viewerVote: 0,
    project: null,
  },
  {
    id: "sample-post-8",
    title: "Is the covered walkway at this public building part of the same project?",
    body: "The main building looks finished but there is separate work happening at the entrance. Curious whether that is a second record or the same one continuing.",
    authorName: "CivicLens Resident",
    createdAt: hoursAgo(94),
    topic: "public-buildings",
    score: 38,
    commentCount: 1,
    viewerVote: 0,
    project: null,
  },
]

const SEED_COMMENTS: CommunityComment[] = [
  {
    id: "sample-comment-1",
    postId: "sample-post-1",
    parentId: null,
    authorName: "resident_cebu",
    body: "I pass this road every day and noticed the same thing. The night lighting is still set up, so it looks like the site is meant to be active.",
    createdAt: hoursAgo(2),
    score: 21,
    viewerVote: 0,
  },
  {
    id: "sample-comment-2",
    postId: "sample-post-1",
    parentId: "sample-comment-1",
    authorName: "jomar_p",
    body: "Same here. The contractor's signboard lists a completion date, though that describes the official record rather than what is happening on site right now.",
    createdAt: hoursAgo(1),
    score: 8,
    viewerVote: 0,
  },
  {
    id: "sample-comment-3",
    postId: "sample-post-1",
    parentId: "sample-comment-2",
    authorName: "resident_cebu",
    body: "That is a fair distinction. Worth checking the official record before anyone assumes a reason for the pause.",
    createdAt: hoursAgo(1),
    score: 5,
    viewerVote: 0,
  },
  {
    id: "sample-comment-4",
    postId: "sample-post-1",
    parentId: null,
    authorName: "mapper_ph",
    body: "For what it is worth, the project appears on the map with its documented location. That is a good starting point for comparing what residents are seeing.",
    createdAt: hoursAgo(2),
    score: 12,
    viewerVote: 0,
  },
  {
    id: "sample-comment-5",
    postId: "sample-post-2",
    parentId: null,
    authorName: "ana_reyes",
    body: "The canal on my side of the street was widened first, then covered. Looks like the same sequence here.",
    createdAt: hoursAgo(7),
    score: 14,
    viewerVote: 0,
  },
  {
    id: "sample-comment-6",
    postId: "sample-post-2",
    parentId: "sample-comment-5",
    authorName: "CivicLens Resident",
    body: "Thanks, that is useful context. I will take another look at the sidewalk section this weekend.",
    createdAt: hoursAgo(6),
    score: 4,
    viewerVote: 0,
  },
  {
    id: "sample-comment-7",
    postId: "sample-post-3",
    parentId: null,
    authorName: "transparency_ph",
    body: "The official record usually carries the contract amount and the implementing agency. Reading it straight from the source avoids guessing from the signboard.",
    createdAt: hoursAgo(18),
    score: 33,
    viewerVote: 0,
  },
  {
    id: "sample-comment-8",
    postId: "sample-post-3",
    parentId: "sample-comment-7",
    authorName: "kim_l",
    body: "Agreed. It also helps to note the date you looked it up, since records get updated.",
    createdAt: hoursAgo(16),
    score: 11,
    viewerVote: 0,
  },
  {
    id: "sample-comment-9",
    postId: "sample-post-3",
    parentId: null,
    authorName: "resident_mandaue",
    body: "Would be good to have a short explainer on which fields come from the official source.",
    createdAt: hoursAgo(12),
    score: 6,
    viewerVote: 0,
  },
  {
    id: "sample-comment-10",
    postId: "sample-post-4",
    parentId: null,
    authorName: "bikes_daily",
    body: "The markings look fresh. The shoulder you mentioned is still gravel as of this morning.",
    createdAt: hoursAgo(24),
    score: 9,
    viewerVote: 0,
  },
  {
    id: "sample-comment-11",
    postId: "sample-post-4",
    parentId: "sample-comment-10",
    authorName: "CivicLens Resident",
    body: "Noted, thanks. That matches what I saw.",
    createdAt: hoursAgo(22),
    score: 3,
    viewerVote: 0,
  },
  {
    id: "sample-comment-12",
    postId: "sample-post-5",
    parentId: null,
    authorName: "flood_watch_ph",
    body: "The official completion date is the thing to check here. What residents observe on site is a separate account from the record.",
    createdAt: hoursAgo(40),
    score: 27,
    viewerVote: 0,
  },
  {
    id: "sample-comment-13",
    postId: "sample-post-5",
    parentId: "sample-comment-12",
    authorName: "resident_talisay",
    body: "Right. Last season the water still reached the road near the corner, which is worth documenting as an observation rather than a conclusion.",
    createdAt: hoursAgo(36),
    score: 15,
    viewerVote: 0,
  },
  {
    id: "sample-comment-14",
    postId: "sample-post-5",
    parentId: null,
    authorName: "engr_dela_cruz",
    body: "Scope matters too — riverbank works and road drainage are often separate records.",
    createdAt: hoursAgo(30),
    score: 18,
    viewerVote: 0,
  },
  {
    id: "sample-comment-15",
    postId: "sample-post-6",
    parentId: null,
    authorName: "commuter_ph",
    body: "The temporary routing has been in place for a few weeks now. Afternoons are the busiest.",
    createdAt: hoursAgo(50),
    score: 7,
    viewerVote: 0,
  },
  {
    id: "sample-comment-16",
    postId: "sample-post-7",
    parentId: null,
    authorName: "transparency_ph",
    body: "Short version: the identifier and the dates come from the official record. Anything about current physical progress is an observation.",
    createdAt: hoursAgo(70),
    score: 22,
    viewerVote: 0,
  },
  {
    id: "sample-comment-17",
    postId: "sample-post-7",
    parentId: "sample-comment-16",
    authorName: "new_resident",
    body: "That distinction cleared it up for me, thank you.",
    createdAt: hoursAgo(66),
    score: 6,
    viewerVote: 0,
  },
  {
    id: "sample-comment-18",
    postId: "sample-post-8",
    parentId: null,
    authorName: "mapper_ph",
    body: "Entrance works are sometimes filed separately. Checking the record for each is the safest read.",
    createdAt: hoursAgo(88),
    score: 5,
    viewerVote: 0,
  },
]

/**
 * In-memory community source seeded with realistic sample discussion.
 *
 * Writes and votes persist for the session so the interactions behave
 * correctly, and are lost on reload. Nothing here reaches a server.
 */
function createSeededSource(): CommunitySource {
  const posts: CommunityPost[] = SEED_POSTS.map((post) => ({ ...post }))
  const comments: CommunityComment[] = SEED_COMMENTS.map((comment) => ({ ...comment }))

  const findPost = (postId: string) => posts.find((post) => post.id === postId)

  const recount = (postId: string) => {
    const post = findPost(postId)
    if (post) {
      post.commentCount = comments.filter((comment) => comment.postId === postId).length
    }
  }

  return {
    isSampleContent: true,

    async listPosts(query) {
      return selectPosts(posts, query).map((post) => ({ ...post }))
    },

    async getPost(postId) {
      const post = findPost(postId)
      return post ? { ...post } : null
    },

    async listComments(postId) {
      return buildCommentTree(
        comments
          .filter((comment) => comment.postId === postId)
          .map((comment) => ({ ...comment })),
      )
    },

    async createPost(input) {
      const post: CommunityPost = {
        id: `local-post-${crypto.randomUUID()}`,
        title: input.title.trim(),
        body: input.body.trim(),
        authorName: "You",
        createdAt: new Date().toISOString(),
        topic: input.topic,
        score: 1,
        commentCount: 0,
        viewerVote: 1,
        project: SEED_PROJECTS.find((project) => project.id === input.projectId) ?? null,
      }
      posts.unshift(post)
      return { ...post }
    },

    async createComment(input) {
      const comment: CommunityComment = {
        id: `local-comment-${crypto.randomUUID()}`,
        postId: input.postId,
        parentId: input.parentId,
        authorName: "You",
        body: input.body.trim(),
        createdAt: new Date().toISOString(),
        score: 1,
        viewerVote: 1,
      }
      comments.push(comment)
      recount(input.postId)
      return { ...comment }
    },

    async votePost(postId, direction) {
      const post = findPost(postId)
      if (!post) throw new Error("This discussion is no longer available.")
      const next = applyVote(post, direction)
      post.score = next.score
      post.viewerVote = next.viewerVote
      return next
    },

    async voteComment(commentId, direction) {
      const comment = comments.find((item) => item.id === commentId)
      if (!comment) throw new Error("This comment is no longer available.")
      const next = applyVote(comment, direction)
      comment.score = next.score
      comment.viewerVote = next.viewerVote
      return next
    },

    async searchProjects(term) {
      const query = term.trim().toLowerCase()
      const matches = query
        ? SEED_PROJECTS.filter((project) => project.name.toLowerCase().includes(query))
        : SEED_PROJECTS
      return matches.map((project) => ({ ...project }))
    },
  }
}

let source: CommunitySource | null = null

/**
 * Returns the process-wide community source, creating it on first use.
 *
 * Hooks accept a `CommunitySource` parameter that defaults to this, which is
 * the seam a Supabase-backed implementation plugs into.
 */
export function getCommunitySource(): CommunitySource {
  if (!source) source = createSeededSource()
  return source
}
