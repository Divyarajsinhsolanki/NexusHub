require "set"

module Saas
  class PlanCatalog
    MODULES = {
      "core_workspace" => {
        name: "Workspace Core",
        description: "People, roles, teams, posts, chat, and notifications.",
        minimum_plan: "starter"
      },
      "project_delivery" => {
        name: "Project Delivery",
        description: "Projects, sprints, tasks, work logs, and team planning.",
        minimum_plan: "starter"
      },
      "knowledge" => {
        name: "Knowledge System",
        description: "Knowledge cards, bookmarks, learning goals, and review flows.",
        minimum_plan: "starter"
      },
      "pdf_master" => {
        name: "PDF Master",
        description: "Personal PDF library, editing, redaction, versions, and exports.",
        minimum_plan: "starter"
      },
      "integrations" => {
        name: "Integrations",
        description: "Keka, Google Sheets, imports, exports, and connected workflows.",
        minimum_plan: "growth"
      },
      "product_analytics" => {
        name: "Product Analytics",
        description: "Activation, retention, feature usage, and account health events.",
        minimum_plan: "growth"
      },
      "lifecycle_messaging" => {
        name: "Lifecycle Messaging",
        description: "Invites, reminders, digests, nudges, and billing notices.",
        minimum_plan: "growth"
      },
      "audit_logs" => {
        name: "Audit Logs",
        description: "Workspace activity history for sensitive admin actions.",
        minimum_plan: "enterprise"
      },
      "enterprise_security" => {
        name: "Enterprise Security",
        description: "SSO, 2FA policy, API tokens, webhooks, and data controls.",
        minimum_plan: "enterprise"
      }
    }.freeze

    PLANS = {
      "starter" => {
        key: "starter",
        name: "Starter",
        positioning: "Small delivery teams validating a shared operating workspace.",
        monthly_cents: 0,
        seat_limit: 5,
        project_limit: 8,
        pdf_document_limit: 25,
        storage_limit_bytes: 1.gigabyte,
        modules: %w[core_workspace project_delivery knowledge pdf_master],
        next_plan_key: "growth"
      },
      "growth" => {
        key: "growth",
        name: "Growth",
        positioning: "Growing service teams that need integrations, analytics, and lifecycle messaging.",
        monthly_cents: 4900,
        seat_limit: 25,
        project_limit: 75,
        pdf_document_limit: 500,
        storage_limit_bytes: 25.gigabytes,
        modules: %w[
          core_workspace
          project_delivery
          knowledge
          pdf_master
          integrations
          product_analytics
          lifecycle_messaging
        ],
        next_plan_key: "enterprise"
      },
      "enterprise" => {
        key: "enterprise",
        name: "Enterprise",
        positioning: "Enterprise operations teams that need security, compliance, APIs, and scale.",
        monthly_cents: nil,
        seat_limit: nil,
        project_limit: nil,
        pdf_document_limit: nil,
        storage_limit_bytes: 250.gigabytes,
        modules: MODULES.keys,
        next_plan_key: nil
      }
    }.freeze

    class << self
      def keys
        PLANS.keys
      end

      def all
        PLANS.values.map { |plan| serialize_plan(plan) }
      end

      def find(key)
        PLANS[key.to_s] || PLANS.fetch("starter")
      end

      def snapshot(workspace)
        plan = find(effective_plan_key(workspace))
        enabled_keys = enabled_module_keys(workspace, plan)

        {
          plan: serialize_plan(plan),
          billing: billing_payload(workspace),
          limits: limits_payload(workspace, plan),
          usage: usage_payload(workspace),
          modules: modules_payload(enabled_keys),
          plans: all
        }
      end

      def module_enabled?(workspace, module_key)
        plan = find(effective_plan_key(workspace))
        enabled_module_keys(workspace, plan).include?(module_key.to_s)
      end

      def effective_plan_key(workspace)
        subscription = workspace.billing_subscription
        return workspace.plan_key unless subscription

        subscription.entitled? ? subscription.plan_key : "starter"
      end

      private

      def serialize_plan(plan)
        plan.slice(
          :key,
          :name,
          :positioning,
          :monthly_cents,
          :seat_limit,
          :project_limit,
          :pdf_document_limit,
          :storage_limit_bytes,
          :modules,
          :next_plan_key
        )
      end

      def billing_payload(workspace)
        {
          status: workspace.billing_status,
          trial_ends_at: workspace.trial_ends_at,
          trialing: workspace.billing_status == "trialing" && workspace.trial_ends_at&.future? == true,
          active: effective_plan_key(workspace) == "starter" || (workspace.billing_subscription ? workspace.billing_subscription.entitled? : workspace.billing_status == "active")
        }
      end

      def limits_payload(workspace, plan)
        {
          seats: workspace.seat_limit_override.presence || plan[:seat_limit],
          projects: plan[:project_limit],
          pdf_documents: plan[:pdf_document_limit],
          storage_bytes: plan[:storage_limit_bytes]
        }
      end

      def usage_payload(workspace)
        workspace_id = workspace.id

        {
          seats: WorkspaceSeats.used(workspace),
          reserved_seats: WorkspaceSeats.reserved(workspace),
          projects: Project.unscoped.where(workspace_id: workspace_id).count,
          teams: Team.unscoped.where(workspace_id: workspace_id).count,
          pdf_documents: PdfDocument.unscoped.where(workspace_id: workspace_id).count,
          storage_bytes: PdfDocumentVersion.unscoped.where(workspace_id: workspace_id).sum(:byte_size)
        }
      end

      def modules_payload(enabled_keys)
        MODULES.map do |key, definition|
          definition.merge(
            key: key,
            enabled: enabled_keys.include?(key)
          )
        end
      end

      def enabled_module_keys(workspace, plan)
        overrides = (workspace.module_overrides || {}).stringify_keys
        keys = MODULES.keys.select do |key|
          overrides.key?(key) ? ActiveModel::Type::Boolean.new.cast(overrides[key]) : plan[:modules].include?(key)
        end

        keys.to_set
      end
    end
  end
end
