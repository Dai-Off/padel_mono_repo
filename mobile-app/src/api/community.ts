import { API_URL } from "../config";

export interface CommunityPlayer {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export interface CommunityPostImage {
  id: string;
  image_url: string;
  display_order: number;
}

export interface CommunityPost {
  id: string;
  player_id: string;
  caption: string | null;
  location: string | null;
  post_type: 'post' | 'story' | 'reel';
  likes_count: number;
  comments_count: number;
  has_liked: boolean;
  has_bookmarked: boolean;
  created_at: string;
  player: CommunityPlayer;
  images: CommunityPostImage[];
}

export interface StoryGroup {
  player_id: string;
  player: CommunityPlayer;
  stories: CommunityPost[];
}

export interface CommunityComment {
  id: string;
  post_id: string;
  player_id: string;
  content: string;
  created_at: string;
  player: CommunityPlayer;
}

function getHeaders(token: string | null | undefined) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchFeed(token: string | null | undefined, cursor?: string): Promise<{ ok: boolean; posts: CommunityPost[]; next_cursor: string | null; error?: string }> {
  try {
    const url = new URL(`${API_URL}/community/feed`);
    if (cursor) url.searchParams.append("cursor", cursor);

    const response = await fetch(url.toString(), {
      headers: getHeaders(token),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, posts: [], next_cursor: null, error: (err as Error).message };
  }
}

export async function fetchStories(token: string | null | undefined): Promise<{ ok: boolean; groups: StoryGroup[]; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/community/stories`, {
      headers: getHeaders(token),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, groups: [], error: (err as Error).message };
  }
}

export async function createPost(token: string | null | undefined, data: {
  files: { uri: string; name: string; type: string }[];
  caption?: string;
  location?: string;
  post_type?: string;
}): Promise<{ ok: boolean; post?: CommunityPost; error?: string }> {
  try {
    const formData = new FormData();
    
    data.files.forEach((file, index) => {
      // @ts-ignore: FormData in React Native requires this format
      formData.append('files', {
        uri: file.uri,
        name: file.name,
        type: file.type,
      });
    });

    if (data.caption) formData.append('caption', data.caption);
    if (data.location) formData.append('location', data.location);
    if (data.post_type) formData.append('post_type', data.post_type);

    const response = await fetch(`${API_URL}/community/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    return await response.json();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function toggleLike(token: string | null | undefined, postId: string): Promise<{ ok: boolean; liked?: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/community/posts/${postId}/like`, {
      method: "POST",
      headers: getHeaders(token),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function toggleBookmark(token: string | null | undefined, postId: string): Promise<{ ok: boolean; bookmarked?: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/community/posts/${postId}/bookmark`, {
      method: "POST",
      headers: getHeaders(token),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function fetchComments(token: string | null | undefined, postId: string, cursor?: string): Promise<{ ok: boolean; comments: CommunityComment[]; next_cursor: string | null; error?: string }> {
  try {
    const url = new URL(`${API_URL}/community/posts/${postId}/comments`);
    if (cursor) url.searchParams.append("cursor", cursor);

    const response = await fetch(url.toString(), {
      headers: getHeaders(token),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, comments: [], next_cursor: null, error: (err as Error).message };
  }
}

export async function addComment(token: string | null | undefined, postId: string, content: string): Promise<{ ok: boolean; comment?: CommunityComment; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/community/posts/${postId}/comments`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({ content }),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function reportPost(token: string | null | undefined, postId: string, reason: string, description?: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/community/posts/${postId}/report`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({ reason, description }),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deletePost(token: string | null | undefined, postId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/community/posts/${postId}`, {
      method: "DELETE",
      headers: getHeaders(token),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
