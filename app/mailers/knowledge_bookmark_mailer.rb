class KnowledgeBookmarkMailer < ApplicationMailer
  def reminder(bookmark)
    @bookmark = bookmark
    @user = bookmark.user
    mail(to: @user.email, subject: "It's time to review your saved #{bookmark.card_type.humanize}")
  end
end
