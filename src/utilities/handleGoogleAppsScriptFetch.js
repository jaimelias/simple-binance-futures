export const handleGoogleAppsScriptFetch = async (finalUrl, options) => {

    const response = UrlFetchApp.fetch(finalUrl, options);

    // Handle response
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
  
    if (statusCode === 200) {
      return JSON.parse(responseText);
    }
  
    throw new Error(`Request failed with status ${statusCode}: ${responseText}`)
}