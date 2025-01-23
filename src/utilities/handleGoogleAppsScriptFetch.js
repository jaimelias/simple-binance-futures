const statusTextMap = {
  200: 'OK',
  201: 'Created',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
}

export const handleGoogleAppsScriptFetch = async (finalUrl, options) => {

    const response = UrlFetchApp.fetch(finalUrl, options)

    // Handle response
    const status = response.getResponseCode()
    const responseText = response.getContentText()
  
    if (status === 200) {
      return JSON.parse(responseText)
    }

    const statusText = statusTextMap[status] || 'Unknown Status'
    const statusMess = (statusText) ? `${status} (${statusText})` : status
  
    throw new Error(
      `Request failed with status ${statusMess}. ` +
      `Body: ${responseText}`
    )
}