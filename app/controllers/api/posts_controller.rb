class Api::PostsController < Api::BaseController
  # before_action :authenticate_user!, only: [:create, :update, :destroy]
  include Rails.application.routes.url_helpers

  COMMENTS_PREVIEW_LIMIT = 5

  before_action :set_post, only: [:like, :unlike]

  def index
    posts = Post.includes(image_attachment: :blob, user: { profile_picture_attachment: :blob })
    posts = posts.where(user_id: params[:user_id]) if params[:user_id].present?
    posts = posts.order(created_at: :desc)

    paginated = posts.page(page_number).per(posts_per_page)
    page_posts = paginated.to_a
    post_ids = page_posts.map(&:id)
    comment_previews = comment_previews_for(post_ids)
    like_counts = PostLike.where(post_id: post_ids).group(:post_id).count
    liked_post_ids = current_user.post_likes.where(post_id: post_ids).pluck(:post_id)

    render json: {
      data: page_posts.map do |post|
        serialize_post(
          post,
          comments: comment_previews.fetch(post.id, []),
          likes_count: like_counts.fetch(post.id, 0),
          liked_by_current: liked_post_ids.include?(post.id)
        )
      end,
      meta: pagination_meta(paginated)
    }
  end

  def create
    post = current_user.posts.build(post_params)
    if post.save
      render json: serialize_post(post), status: :created
    else
      render json: { errors: post.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    post = current_user.posts.find(params[:id])
    if post.update(post_params)
      render json: serialize_post(post)
    else
      render json: { errors: post.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    post = current_user.posts.find_by(id: params[:id])
    return head :forbidden unless post

    post.destroy
    render json: { message: 'Post deleted successfully' }
  end

  def like
    like = @post.post_likes.find_or_initialize_by(user: current_user)
    if like.persisted? || like.save
      @post = find_post(@post.id)
      render json: serialize_post(@post), status: :ok
    else
      render json: { errors: like.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def unlike
    like = @post.post_likes.find_by(user: current_user)
    like&.destroy
    @post = find_post(@post.id)
    render json: serialize_post(@post), status: :ok
  end

  private

  def post_params
    params.require(:post).permit(:message, :image)
  end

  def set_post
    @post = find_post(params[:id])
  end

  def find_post(id)
    Post.includes(image_attachment: :blob, user: { profile_picture_attachment: :blob }).find(id)
  end

  def serialize_post(post, comments: nil, likes_count: nil, liked_by_current: nil)
    comments ||= post.comments
      .includes(user: { profile_picture_attachment: :blob })
      .order(:created_at, :id)
      .limit(COMMENTS_PREVIEW_LIMIT)
      .to_a
    likes_count = post.post_likes.count if likes_count.nil?
    if liked_by_current.nil?
      liked_by_current = current_user.present? && post.post_likes.exists?(user_id: current_user.id)
    end

    {
      id: post.id,
      message: post.message,
      image_url: post.image.attached? ? rails_blob_url(post.image, disposition: 'inline', only_path: true) : nil,
      created_at: post.created_at.iso8601,
      likes_count: likes_count,
      liked_by_current_user: liked_by_current,
      comments_count: post.comments_count,
      has_more_comments: post.comments_count > COMMENTS_PREVIEW_LIMIT,
      comments: serialize_comments(post, comments),
      user: {
        id: post.user.id,
        email: post.user.email,
        first_name: post.user.first_name,
        last_name: post.user.last_name,
        profile_picture: post.user.profile_picture.attached? ? rails_blob_url(post.user.profile_picture, only_path: true) : nil
      }
    }
  end

  def comment_previews_for(post_ids)
    return {} if post_ids.empty?

    ranked_comments = Comment
      .where(post_id: post_ids)
      .select(
        "comments.*",
        "ROW_NUMBER() OVER (PARTITION BY comments.post_id ORDER BY comments.created_at ASC, comments.id ASC) AS preview_rank"
      )

    Comment
      .from("(#{ranked_comments.to_sql}) comments")
      .where("comments.preview_rank <= ?", COMMENTS_PREVIEW_LIMIT)
      .includes(user: { profile_picture_attachment: :blob })
      .order(:post_id, :created_at, :id)
      .group_by(&:post_id)
  end

  def page_number
    [params[:page].to_i, 1].max
  end

  def posts_per_page
    requested = params[:per_page].to_i
    requested = 20 unless requested.positive?
    [requested, 100].min
  end

  def pagination_meta(paginated)
    {
      current_page: paginated.current_page,
      next_page: paginated.next_page,
      prev_page: paginated.prev_page,
      total_pages: paginated.total_pages,
      total_count: paginated.total_count,
      per_page: paginated.limit_value
    }
  end

  def serialize_comments(post, comments)
    comments.map do |comment|
      {
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at.iso8601,
        can_delete: current_user.present? && (comment.user_id == current_user.id || post.user_id == current_user.id),
        user: {
          id: comment.user.id,
          email: comment.user.email,
          first_name: comment.user.first_name,
          last_name: comment.user.last_name,
          profile_picture: comment.user.profile_picture.attached? ? rails_blob_url(comment.user.profile_picture, only_path: true) : nil
        }
      }
    end
  end
end
