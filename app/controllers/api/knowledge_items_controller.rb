class Api::KnowledgeItemsController < Api::BaseController
  before_action :set_knowledge_item, only: [:archive]

  def index
    records = KnowledgeItem.visible_to(current_user).includes(:knowledge_prompt_run).latest_first
    records = records.where(active: ActiveModel::Type::Boolean.new.cast(params[:active])) if params.key?(:active)
    records = records.where(category: params[:category]) if params[:category].present?
    records = records.where(collection_name: params[:collection_name]) if params[:collection_name].present?
    records = search(records, params[:q]) if params[:q].present?
    records = records.limit(limit_param)

    render json: records.map { |item| serialize_item(item) }
  end

  def archive
    @knowledge_item.archive!
    render json: serialize_item(@knowledge_item.reload)
  end

  private

  def set_knowledge_item
    @knowledge_item = current_user.knowledge_items.find(params[:id])
  end

  def search(records, query)
    pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query.to_s.strip)}%"
    records.where("title ILIKE :pattern OR summary ILIKE :pattern OR body ILIKE :pattern", pattern: pattern)
  end

  def limit_param
    params.fetch(:limit, 100).to_i.clamp(1, 200)
  end

  def serialize_item(item)
    {
      id: item.id,
      can_archive: item.user_id == current_user.id,
      workspace_shared: item.payload["workspace_shared"] == true && item.knowledge_prompt_run&.source == "bedrock_daily",
      title: item.title,
      summary: item.summary,
      body: item.body,
      category: item.category,
      item_type: item.item_type,
      collection_name: item.collection_name,
      source_name: item.source_name,
      source_url: item.source_url,
      source_key: item.source_key,
      published_at: item.published_at,
      tags: item.tags,
      payload: item.payload,
      active: item.active,
      archived_at: item.archived_at,
      replaced_by_id: item.replaced_by_id,
      position: item.position,
      prompt_run_id: item.knowledge_prompt_run_id,
      prompt: item.knowledge_prompt_run&.prompt,
      generated_source: item.knowledge_prompt_run&.source,
      generation_mode: item.knowledge_prompt_run&.generation_mode,
      created_at: item.created_at,
      updated_at: item.updated_at
    }
  end
end
