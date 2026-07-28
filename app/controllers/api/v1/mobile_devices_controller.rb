class Api::V1::MobileDevicesController < Api::V1::BaseController
  def upsert
    attributes = params.require(:device).permit(:expo_push_token, :platform, :device_identifier, :device_name, :app_version)
    device = MobileDevice.find_or_initialize_by(expo_push_token: attributes[:expo_push_token])
    device.assign_attributes(
      attributes.merge(
        user: current_user,
        workspace: current_user.workspace,
        active: true,
        disabled_at: nil,
        last_seen_at: Time.current
      )
    )

    return render_validation_error(device) unless device.save

    render_data(serialize_device(device))
  end

  def destroy
    device = current_user.mobile_devices.find_by(id: params[:id])
    device ||= current_user.mobile_devices.find_by(expo_push_token: params[:expo_push_token])
    raise ActiveRecord::RecordNotFound unless device

    device.disable!
    render_data({ disabled: true })
  end

  private

  def serialize_device(device)
    {
      id: device.id,
      platform: device.platform,
      device_name: device.device_name,
      app_version: device.app_version,
      active: device.active,
      last_seen_at: device.last_seen_at
    }
  end
end
