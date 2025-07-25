// services/api.js - Optimized for clarity, efficiency, and maintainability
const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

class APIService {
  constructor() {
    this.baseURL = BASE_URL;
    //this.csrfToken = null;
    //this.csrfPromise = null; // Prevent multiple concurrent CSRF requests
  }

  // --- Core Methods ---

  async request(endpoint, { method = 'GET', body = null, headers = {}, ...restOptions } = {}) {
    // Ensure CSRF token is ready for state-changing methods
    const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
    if (isStateChanging) {
      await this.initCSRF();
    }

    const isFormData = body instanceof FormData;

    // Configure headers
    const configHeaders = {
      'X-Requested-With': 'XMLHttpRequest',
      ...headers,
    };
    if (!isFormData && body) {
      configHeaders['Content-Type'] = 'application/json';
    }
    if (isStateChanging && this.csrfToken) {
      configHeaders['X-CSRFToken'] = this.csrfToken;
    }

    // Nếu là request thay đổi dữ liệu, hãy lấy token TRỰC TIẾP từ cookie
    if (isStateChanging) {
      const csrfToken = this.getCookie('csrftoken');
      if (csrfToken) {
        configHeaders['X-CSRFToken'] = csrfToken;
      } else {
        // Có thể thêm cảnh báo ở đây nếu không tìm thấy token
        console.warn('CSRF token not found in cookie. The request might fail.');
      }
    }

    // Configure body
    let processedBody = body;
    if (!isFormData && body) {
      processedBody = JSON.stringify(body);
    }
    
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method,
        body: processedBody,
        headers: configHeaders,
        credentials: 'include',
        ...restOptions,
      });
      
      const contentType = response.headers.get('content-type');
      const isJson = contentType?.includes('application/json');

      if (!response.ok) {
        let errorData;
        try {
          errorData = isJson ? await response.json() : await response.text();
        } catch {
          errorData = response.statusText;
        }
        throw new APIError(response.status, errorData);
      }
      
      if (response.status === 204) { // No Content
        return null;
      }
      
      return isJson ? response.json() : response.text();

    } catch (error) {
      console.error(`API request to ${endpoint} failed:`, error);
      throw error;
    }
  }

  async initCSRF() {
    if (this.csrfToken) return this.csrfToken;

    this.csrfToken = this.getCookie('csrftoken');
    if (this.csrfToken) {
      return this.csrfToken;
    }

    if (this.csrfPromise) return this.csrfPromise;

    this.csrfPromise = (async () => {
      try {
        await this.request('/csrf/', { method: 'GET' });
        this.csrfToken = this.getCookie('csrftoken');
        if (!this.csrfToken) {
          console.warn('CSRF token not found in cookie after /csrf/ call.');
        }
        return this.csrfToken;
      } catch (error) {
        console.warn('CSRF token fetch failed:', error.message);
        return null;
      } finally {
        this.csrfPromise = null;
      }
    })();

    return this.csrfPromise;
  }

  // --- CSRF & Auth Utilities ---

  getCSRFToken() {
    return document.querySelector('[name=csrfmiddlewaretoken]')?.value
      ?? this.getCookie('csrftoken')
      ?? this.csrfToken;
  }
  
  getCookie(name) {
    return document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`)?.pop() || null;
  }

  isAuthenticated() {
    return !!this.getCSRFToken();
  }

  // --- Data Normalization Helpers ---

  normalizeTagData(tags) {
    if (!Array.isArray(tags)) return [];
    return tags.map(tag => {
      if (typeof tag === 'object' && tag !== null) {
        return {
          id: tag?.id ?? tag?.pk ?? tag?.tag_id ?? tag?.name,
          name: tag?.name ?? tag?.title ?? tag?.tag_name ?? tag?.label ?? String(tag),
          color: tag?.color ?? tag?.tag_color ?? '#cccccc',
        };
      }
      if (typeof tag === 'string') {
        return { id: tag, name: tag, color: '#cccccc' };
      }
      return { id: tag, name: String(tag), color: '#cccccc' };
    });
  }

  normalizePostData(post) {
    if (!post) return null;
    const now = new Date().toISOString();
    return {
      ...post,
      tags: this.normalizeTagData(post.tags),
      calculated_score: post.calculated_score ?? post.score ?? 0,
      comment_count: post.comment_count ?? post.comments_count ?? 0,
      author: post.author ?? { username: 'Unknown' },
      user_vote: post.user_vote ?? null,
      created_at: post.created_at ?? now,
      updated_at: post.updated_at ?? post.created_at ?? now,
    };
  }

  // --- API Endpoint Methods ---

  // Authentication
  async login(credentials) {
    return this.request('/api/auth/login/', { method: 'POST', body: credentials });
  }
  async register(userData) {
    return this.request('/api/register/', { method: 'POST', body: userData });
  }
  async logout() {
    const response = await this.request('/api/auth/logout/', { method: 'POST', body: {} });
    this.csrfToken = null;
    return response;
  }
  async checkAuth() {
    try {
      return await this.request('/api/auth/user/');
    } catch {
      return { isAuthenticated: false, user: null };
    }
  }

  // Posts
  async getPosts(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const data = await this.request(queryString ? `/api/posts/?${queryString}` : '/api/posts/');
    const posts = Array.isArray(data) ? data : (data?.results || data?.data || []);
    const normalizedPosts = posts.map(post => this.normalizePostData(post));
    return Array.isArray(data) ? normalizedPosts : { ...data, results: normalizedPosts };
  }
  
  async getPost(id) {
    const post = await this.request(`/api/posts/${id}/`);
    return this.normalizePostData(post);
  }
  
  async createPost(postData) {
    try {
      const post = await this.request('/api/posts/', { method: 'POST', body: postData });
      return this.normalizePostData(post);
    } catch (error) {
      throw error;
    }
  }

  async updatePost(id, postData) {
    const post = await this.request(`/api/posts/${id}/`, { method: 'PUT', body: postData });
    return this.normalizePostData(post);
  }

  async deletePost(id) {
    return this.request(`/api/posts/${id}/`, { method: 'DELETE' });
  }

  // === START: NEW AI OVERVIEW FUNCTION ===
  /**
   * Generates an AI-powered overview for a list of posts.
   * @param {object} payload - The request payload.
   * @param {Array<number|string>} payload.post_ids - An array of post IDs to analyze.
   * @returns {Promise<object>} - The API response containing the overview.
   */
  async generatePostListOverview(payload) {
    return this.request('/api/posts/generate_overview/', {
      method: 'POST',
      body: payload,
    });
  }
  // === END: NEW AI OVERVIEW FUNCTION ===

  // Tags
  async getTags(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const data = await this.request(queryString ? `/api/tags/?${queryString}` : '/api/tags/');
    return data;
  }
  async createTag(tagData) {
    return this.request('/api/tags/create/', { method: 'POST', body: tagData });
  }
  
  // User Profile & Social
  async getUserProfile(username) {
    return this.request(`/api/users/${username}/profile/`);
  }
  async updateUserProfile(username, profileData) {
    if (!(profileData instanceof FormData)) {
      throw new Error('profileData must be an instance of FormData');
    }
    return this.request(`/api/profiles/${username}/`, { method: 'PATCH', body: profileData });
  }
  async followUser(username) {
    return this.request(`/api/users/${username}/follow/`, { method: 'POST', body: {} });
  }

  // Voting
  async vote(postId, voteType) {
    return this.request(`/api/posts/${postId}/vote/`, {
      method: 'POST',
      body: { vote_type: voteType },
    });
  }

  // Comments
  async getCommentsForPost(postId) {
    return this.request(`/api/posts/${postId}/comments/`);
  }
  async createComment(commentData) {
    return this.request('/api/comments/', { method: 'POST', body: commentData });
  }

  // Search
  async searchPosts(query, filters = {}) {
    const params = new URLSearchParams({ q: query, ...filters });
    const data = await this.request(`/api/posts/search/?${params}`);
    if (data?.results) {
      data.results = data.results.map(post => this.normalizePostData(post));
    }
    return data;
  }

  // Bot
  async askBot(postId, payload) {
    return this.request(`/api/posts/${postId}/ask_bot/`, {
        method: 'POST',
        body: payload,
    });
  }

  // --- Utility Accessor ---
  get utils() {
    return {
      initCSRF: this.initCSRF.bind(this),
      getCSRFToken: this.getCSRFToken.bind(this),
      normalizeTagData: this.normalizeTagData.bind(this),
      normalizePostData: this.normalizePostData.bind(this),
    };
  }
}

class APIError extends Error {
  constructor(status, data) {
    const message = typeof data === 'object' && data !== null
      ? data.detail || data.message || JSON.stringify(data)
      : String(data);
      
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

const apiService = new APIService();
export default apiService;