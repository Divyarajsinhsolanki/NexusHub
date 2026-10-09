class Api::ItemsController < Api::BaseController
  before_action :set_item, only: [:update, :destroy]

  def index
    scope = current_user.items
    filtered_items = apply_filters(scope)

    render json: {
      items: filtered_items,
      filters: {
        categories: available_categories(scope),
        tags: available_tags(scope)
      }
    }
  end

  def create
    item = current_user.items.build(item_params)
    if item.save
      render json: item, status: :created
    else
      render json: { errors: item.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @item.update(item_params)
      render json: @item
    else
      render json: { errors: @item.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @item.destroy
    head :no_content
  end

  private

  def set_item
    @item = current_user.items.find(params[:id])
  end

  def item_params
    params.require(:item).permit(:title, :category, :content)
  end

  def apply_filters(scope)
    items = scope

    if params[:q].present?
      items = items.where(id: items.select { |item| [item.title, item.content].any? { |value| value.to_s.downcase.include?(params[:q].to_s.downcase) } }.map(&:id))
    end

    if params[:categories].present?
      categories = Array(params[:categories]).reject(&:blank?)
      items = items.where(category: categories) if categories.any?
    end

    if params[:tags].present?
      tags = Array(params[:tags]).reject(&:blank?)
      items = filter_by_tags(items, tags) if tags.any?
    end

    apply_sort(items)
  end

  def filter_by_tags(scope, tags)
    return scope unless Item.column_names.include?("tags")

    column = Item.columns_hash["tags"]
    if column&.type == :json || column&.type == :jsonb
      tags.reduce(scope) do |relation, tag|
        relation.where("EXISTS (SELECT 1 FROM jsonb_array_elements_text(items.tags::jsonb) AS tag WHERE tag = ?)", tag)
      end
    elsif column&.array
      scope.where("items.tags @> ARRAY[?]::varchar[]", tags)
    else
      patterns = tags.map { |tag| "%#{tag}%" }
      scope.where("COALESCE(items.tags, '') ILIKE ANY (ARRAY[?])", patterns)
    end
  end

  def apply_sort(scope)
    case params[:sort]
    when "title_asc"
      scope.order(Arel.sql("LOWER(title) ASC"))
    when "title_desc"
      scope.order(Arel.sql("LOWER(title) DESC"))
    when "oldest"
      scope.order(:created_at)
    else
      scope.order(created_at: :desc)
    end
  end

  def available_categories(scope)
    scope.distinct.where.not(category: [nil, ""]).order(:category).pluck(:category)
  end

  def available_tags(scope)
    return [] unless Item.column_names.include?("tags")

    raw = scope.pluck(:tags).compact
    raw.flat_map do |value|
      case value
      when Array
        value
      when String
        value.split(",").map(&:strip)
      else
        []
      end
    end.compact.uniq.sort
  end
end
