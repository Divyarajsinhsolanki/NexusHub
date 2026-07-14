Rails.application.routes.draw do
  devise_for :users, controllers: { confirmations: 'users/confirmations' }
  mount ActiveStorage::Engine => "/rails/active_storage"
  mount ActionCable.server => "/cable"

  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
  get "sitemap.xml" => "pages#sitemap", defaults: { format: :xml }
  get "robots.txt" => "pages#robots", defaults: { format: :text }

  root "pages#index"

  get "/mcp", to: "mcp#show"
  post "/mcp", to: "mcp#handle"
  match "/mcp", to: "mcp#preflight", via: :options

  # Legacy PDF reads remain available until their existing 24-hour tokens expire.
  get  "/download_pdf", to: "pdfs#download"
  match "/pdf_file/:token", to: "pdfs#status", via: :head
  get  "/pdf_file/:token", to: "pdfs#show", as: :pdf_file
  get  "/pdf_artifact/:token", to: "pdfs#artifact", as: :pdf_artifact

  # React now handles the /sheet route. Data is provided via the API below.

  namespace :api do
    get 'portfolio', to: 'portfolio#show'
    post 'demo_session', to: 'demo_sessions#create'
    get 'demo/manifest', to: 'demo#manifest'
    get 'search', to: 'search#index'
    get 'activity', to: 'activity#index'

    namespace :admin do
      get 'portfolio', to: 'portfolio#show'
      patch 'portfolio/profile', to: 'portfolio#update_profile'
      post 'portfolio/projects', to: 'portfolio#create_project'
      patch 'portfolio/projects/:id', to: 'portfolio#update_project'
      delete 'portfolio/projects/:id', to: 'portfolio#destroy_project'
      post 'portfolio/projects/:project_id/features', to: 'portfolio#create_feature'
      patch 'portfolio/features/:id', to: 'portfolio#update_feature'
      delete 'portfolio/features/:id', to: 'portfolio#destroy_feature'
      patch 'portfolio/order', to: 'portfolio#update_order'
    end

    post 'signup', to: 'auth#signup'
    post 'login', to: 'auth#login'
    delete 'logout', to: 'auth#logout'
    post   'refresh',       to: 'auth#refresh'
    post 'password/forgot', to: 'passwords#create'
    post 'password/reset',  to: 'passwords#update'
    get 'sprints/last', to: 'sprints#last'  
    get 'view_profile', to: 'auth#view_profile'
    post 'update_profile', to: 'auth#update_profile'
    get 'coding_tip', to: 'coding_tips#show'
    get 'dev_tool_of_the_day', to: 'dev_tools#show'
    get 'english_word', to: 'english_words#show'
    get 'english_tense', to: 'english_tenses#show'
    get 'english_phrase', to: 'english_phrases#show'
    get 'news/local_headlines', to: 'news#local_headlines'
    get 'news/policy_briefs', to: 'news#policy_briefs'
    get 'open_issue_spotlight', to: 'open_source_issues#show'
    get 'sheet', to: 'sheets#show'
    post 'keka/credentials', to: 'keka#credentials'
    get 'keka/profile', to: 'keka#profile'
    post 'keka/refresh', to: 'keka#refresh'

    resources :users, only: [:index, :show, :create, :update, :destroy] do
      collection do
        post :presence
      end
    end
    post 'admin/impersonate', to: 'admin_sessions#create'
    resources :posts, only: [:index, :create, :update, :destroy] do
      resources :comments, only: [:index, :create, :destroy]
      member do
        post :like
        delete :unlike
      end
    end
    resources :sprints, only: [:index, :create, :update, :destroy] do
      member do
        post 'import_tasks'
        post 'export_tasks'
        post 'export_logs'
      end
    end
    resources :developers, only: [:index]
    resources :tasks, only: [:index, :create, :update, :destroy] do
      collection do
        post 'import_backlog'
      end
    end
    resources :teams, only: [:index, :create, :update, :destroy] do
      member do
        get :insights
      end
    end
    resources :team_users, only: [:create, :update, :destroy]
    delete 'team_users/leave/:team_id', to: 'team_users#leave'

    resources :skills, only: [:index]
    resources :user_skills, only: [:index, :create, :update, :destroy]
    resources :skill_endorsements, only: [:create, :destroy]
    resources :learning_goals, only: [:index, :create, :update, :destroy]
    resources :learning_checkpoints, only: [:create, :update, :destroy]

    resources :projects, only: [:index, :create, :update, :destroy] do
      resources :environments, controller: 'project_environments', only: [:index, :create, :update, :destroy]
      resources :vault_items, controller: 'project_vault_items', only: [:index, :create, :update, :destroy]
    end
    resources :project_users, only: [:create, :update, :destroy]
    delete 'project_users/leave/:project_id', to: 'project_users#leave'
    resources :task_logs, only: [:index, :create, :update, :destroy] do
      collection do
        post :bulk_create
        delete :destroy_for_sprint
      end
    end

    resources :items, only: [:index, :create, :update, :destroy]
    resources :issues, only: [:index, :create, :update, :destroy] do
      collection do
        post :import_from_sheet
      end
    end
    resources :departments do
      member do
        get :members
        patch :update_members
      end
    end

    resources :knowledge_bookmarks, only: [:index, :create, :update, :destroy] do
      member do
        post :mark_reviewed
      end
    end
    resources :knowledge_items, only: [:index] do
      member do
        patch :archive
      end
    end
    resources :knowledge_prompt_runs, only: [:index]


    resources :calendar_events, only: [:index, :create, :update, :destroy] do
      resources :event_reminders, only: [:create]
      member do
        patch :reschedule
        get :google_link
      end
      collection do
        get :export_ics
        post :import_ics
      end
    end
    resources :event_reminders, only: [:update, :destroy]

    resources :conversations, only: [:index, :show, :create, :destroy] do
      collection do
        post :start_direct
      end
      member do
        get :summary
        patch :mute
        delete :mute, action: :unmute
        delete :for_everyone
      end
      resources :calls, controller: "conversation_calls", only: [:create]
      resources :messages, only: [:index, :create] do
        resources :reactions, controller: "message_reactions", only: [:create]
        delete "reactions", to: "message_reactions#destroy"
      end
    end

    resources :calls, only: [] do
      member do
        post :ack_ring
        post :join
        post :decline
        post :leave
        post :end, action: :end_call
      end
    end

    resources :notifications, only: [:index] do
      collection do
        post :mark_all_read
      end
      member do
        post :mark_read
      end
    end

    get 'daily_momentum', to: 'daily_momentum#show'

    resources :pdf_documents, only: %i[index show create update destroy] do
      member do
        get :content
        get :download
        post :undo
        post :redo
        post :restore_original
      end
    end
    resources :pdf_document_operations, only: %i[create show]

    resources :roles, only: [:index]

    resources :work_categories, only: [:index, :create, :update, :destroy]
    resources :work_priorities, only: [:index, :create, :update, :destroy]
    resources :work_tags, only: [:index, :create, :update, :destroy]
    resources :work_logs, only: [:index, :create, :update, :destroy]
    resources :work_notes, only: [:index, :create, :update, :destroy]


    resources :contacts, only: [:create]


    get 'admin/tables', to: 'admin#tables'
    get 'admin_meta/:table', to: 'admin#meta'
  
    scope 'admin/:table' do
      get '/', to: 'admin#index'
      post '/', to: 'admin#create'
      patch '/:id', to: 'admin#update'
      delete '/:id', to: 'admin#destroy'
    end

  end

  get "*path", to: "pages#index", constraints: lambda { |req|
    !req.path.start_with?("/rails/active_storage")  # Don't redirect Active Storage URLs
  }
end
