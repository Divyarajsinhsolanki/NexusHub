class PostLike < ApplicationRecord
  include WorkspaceScoped

  belongs_to :post, inverse_of: :post_likes
  belongs_to :user, inverse_of: :post_likes

  validates :user_id, uniqueness: { scope: :post_id }

  after_create_commit :notify_post_owner
  after_destroy_commit :remove_unread_notification

  private

  def notify_post_owner
    return if post.user_id == user_id

    Notification.create(
      recipient: post.user,
      actor: user,
      action: "post_liked",
      notifiable: self,
      metadata: { post_id: post_id }
    )
  end

  def remove_unread_notification
    Notification.unscoped.where(
      notifiable_type: self.class.name,
      notifiable_id: id,
      action: "post_liked",
      read_at: nil
    ).delete_all
  end
end
