class DepartmentEntry < ApplicationRecord
  include WorkspaceScoped
  belongs_to :department
  belongs_to :author, class_name:'User', optional:true
  has_many :department_comments, dependent: :destroy
  validates :kind, inclusion:{in:%w[goal announcement resource]}
  validates :title, presence:true, length:{maximum:200}
  validates :body, length:{maximum:20_000}
  validates :status, inclusion:{in:%w[active completed archived]}
  validates :progress, numericality:{only_integer:true,greater_than_or_equal_to:0,less_than_or_equal_to:100}
  validates :url, length:{maximum:2000}
  validate :safe_resource_url
  validate { errors.add(:due_date, 'is invalid') if due_date_before_type_cast.present? && due_date.nil? }
  before_validation { self.progress = 100 if kind == 'goal' && status == 'completed' }

  private
  def safe_resource_url
    return if url.blank?
    uri = URI.parse(url)
    errors.add(:url,'must be an HTTPS link without embedded credentials') unless uri.scheme == 'https' && uri.host.present? && uri.userinfo.nil?
  rescue URI::InvalidURIError
    errors.add(:url,'is invalid')
  end
end
