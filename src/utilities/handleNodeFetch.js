export const handleNodeFetch = async (main, finalUrl, options) => {

    const {fetch: standardFetch} = main.callbacks

    // Make the request
    const response = await standardFetch(finalUrl, options)

    // Handle response
    const {status, statusText} = response
    const responseText = await response.text()

    if (status === 200) {
        return JSON.parse(responseText)
    }

    const statusMess = (statusText) ? `${status} (${statusText})` : status

    throw new Error(
      `Request failed with status ${statusMess}. ` +
      `Body: ${responseText}`
    )
}