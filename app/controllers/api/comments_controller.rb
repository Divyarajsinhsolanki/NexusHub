class Api::CommentsController < Api::BaseController
  include Rails.application.routes.url_helpers

  before_action :set_post
  before_action :set_comment, only: :destroy

  def index
    comments = @post.comments.includes(user: { profile_picture_attachment: :blob }).order(:created_at, :id)
    render json: comments.map { |comment| serialize_comment(comment) }
  end

  def create
    comment = @post.comments.build(comment_params.merge(user: current_user))

    if comment.save
      render json: serialize_comment(comment), status: :created
    else
      render json: { errors: comment.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    unless @comment.user_id == current_user.id || @post.user_id == current_user.id
      return head :forbidden
    end

    @comment.destroy
    head :no_content
  end

  private

  def set_post
    @post = Post.find(params[:post_id])
  end

  def set_comment
    @comment = @post.comments.find(params[:id])
  end

  def comment_params
    params.require(:comment).permit(:body)
  end

  def serialize_comment(comment)
    {
      id: comment.id,
      body: comment.body,
      created_at: comment.created_at.iso8601,
      can_delete: current_user.present? && (comment.user_id == current_user.id || @post.user_id == current_user.id),
      user: {
        id: comment.user.id,
        email: comment.user.email,
        first_name: comment.user.first_name,
        last_name: comment.user.last_name,
        profile_picture: comment.user.profile_picture.attached? ?
          rails_blob_url(comment.user.profile_picture, only_path: true) : nil
      }
    }
  end
end
