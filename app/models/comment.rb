class Comment < ApplicationRecord
  include UserStampable
  include WorkspaceScoped

  belongs_to :post, counter_cache: true, inverse_of: :comments
  belongs_to :user, inverse_of: :comments

  validates :body, presence: true

  after_create :notify_post_owner

  private

  def notify_post_owner
    # Don't notify if commenting on own post
    return if post.user_id == user_id

    Notification.create(
      recipient: post.user,
      actor: user,
      action: 'post_commented',
      notifiable: self,
      metadata: { post_id: post.id, comment_body: body.truncate(50) }
    )
  end
end
