require Rails.root.join('lib/recovery/deployment_safety')
Recovery::DeploymentSafety.validate!(ENV) if Rails.env.production?
