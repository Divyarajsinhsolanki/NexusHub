require 'digest'

module Tasks
  # Both API surfaces use the same transaction and assignment-group ordering.
  class Updater
    class GroupChanged < StandardError; end

    def self.call(task, attributes)
      new(task, attributes.to_h.symbolize_keys).call
    end

    def initialize(task, attributes)
      @task, @attributes = task, attributes
    end

    def call
      attempts = 0
      begin
        attempts += 1
        previous = group(@task)
        candidate = @task.dup
        candidate.assign_attributes(@attributes)
        destination = group(candidate)
        Task.transaction do
          [previous, destination].uniq.sort_by(&:to_s).each do |assignment|
            key = Digest::SHA256.hexdigest([@task.workspace_id, assignment.to_s].join(':'))[0, 15].to_i(16)
            Task.connection.execute("SELECT pg_advisory_xact_lock(#{key})")
          end
          @task.reload.lock!
          raise GroupChanged unless group(@task) == previous

          old_ids = ordered_ids(previous)
          @task.assign_attributes(@attributes)
          ids = ordered_ids(destination).excluding(@task.id)
          position = if @attributes[:order].present?
            @attributes[:order].to_i.clamp(1, ids.length + 1) - 1
          elsif previous == destination
            old_ids.index(@task.id) || ids.length
          else
            ids.length
          end
          @task.order = position + 1
          next false unless @task.save

          ids.insert(position, @task.id)
          normalize(destination, ids)
          normalize(previous, old_ids.excluding(@task.id)) unless previous == destination
          true
        end
      rescue GroupChanged
        retry if attempts < 3
        raise ActiveRecord::StaleObjectError.new(@task, 'update')
      end
    end

    private

    def group(task)
      values = { project_id: task.project_id, sprint_id: task.sprint_id, developer_id: task.developer_id }
      values[:qa_assigned] = task.qa_assigned.presence unless task.developer_id
      if task.type == 'general'
        values.merge!(type: 'general', created_by: task.created_by)
      end
      values
    end

    def scope(assignment)
      filters = assignment.dup
      empty_qa = filters.key?(:qa_assigned) && filters[:qa_assigned].nil?
      filters.delete(:qa_assigned) if empty_qa
      records = Task.unscoped.where(workspace_id: @task.workspace_id).where(filters)
      records = records.where(qa_assigned: [nil, '']) if empty_qa
      assignment[:type] == 'general' ? records : records.where.not(type: 'general')
    end

    def ordered_ids(assignment)
      scope(assignment).order(Arel.sql('"order" ASC NULLS LAST'), :id).pluck(:id)
    end

    def normalize(assignment, ids)
      ids.each_with_index { |id, index| scope(assignment).where(id: id).where('"order" IS DISTINCT FROM ?', index + 1).update_all(order: index + 1) }
    end
  end
end
