import { Web5 } from "@web5/api";
import { VerifiableCredential, PresentationExchange } from "@web5/credentials";
import { DidKeyMethod, utils as didUtils } from "@web5/dids";
import { Ed25519, Jose } from "@web5/crypto";

let web5;
let myDid;
let selectedCourseId;

const protocolDefinition = {
  protocol: "https://example.com/dudemy",
  published: true,
  types: {
    course: {
      schema: "https://example.com/dudemy/schema1",
      dataFormats: ["application/json"],
    },
    content: {
      schema: "https://example.com/dudemy/schema2",
      dataFormats: ["application/json"],
    },
    video: {
      schema: "https://example.com/dudemy/schema3",
      dataFormats: ["video/mp4"],
    },
    comments: {
      dataFormats: ["application/json"],
    },
  },
  structure: {
    course: {
      $actions: [
        {
          who: "anyone",
          can: "read",
        },
        {
          who: "anyone",
          can: "write",
        },
      ],
      content: {
        $actions: [
          {
            who: "anyone",
            can: "read",
          },
          {
            who: "author",
            of: "course",
            can: "write",
          },
        ],
        video: {
          $actions: [
            {
              who: "author",
              of: "course/content",
              can: "write",
            },
            {
              who: "anyone",
              can: "read",
            },
          ],
        },
      },
      comments: {
        $actions: [
          {
            who: "anyone",
            can: "write",
          },
          {
            who: "anyone",
            can: "read",
          },
        ],
      },
    },
  },
};
// protocol paths
("course");
("course/content");
("course/content/video");
("course/comments");

async function configProtocol() {
  const { protocol, status } = await web5.dwn.protocols.configure({
    message: {
      definition: protocolDefinition,
    },
  });
  await protocol.send(myDid);
  return protocol;
}

//   courses show on load, remove null records
async function fetchCoursesByInstructor() {
  const queryOptions = {
    message: {
      filter: {
        protocol: "https://example.com/dudemy",
      },
      limit: 5,
    },
  };

  const { records } = await web5.dwn.records.query(queryOptions);

  const courses = await Promise.all(
    records.map(async (record) => {
      try {
        const { record: detailedRecord } = await web5.dwn.records.read({
          message: {
            filter: {
              recordId: record.id,
            },
          },
        });
        const courseData = await detailedRecord.data.json();
        return { ...courseData, id: record.id };
      } catch (error) {
        return null;
      }
    })
  );

  const validCourses = courses.filter((course) => {
    return (
      course && course.title !== undefined && course.description !== undefined
    );
  });

  return validCourses;
}

// creates course
function handleCourseCreation() {
  const title = document.getElementById("courseTitle").value;
  const description = document.getElementById("courseDescription").value;
  const author = document.getElementById("courseAuthor").value;
  const courseData = {
    title: title,
    description: description,
    author: author,
  };

  createCourseData(web5, courseData);
}

// create course data function
async function createCourseData(web5, courseData) {
  try {
    if (!courseData.title || !courseData.description || !courseData.author) {
      throw new Error("Invalid course metadata");
    }

    //
    const record = {
      data: {
        title: courseData.title,
        description: courseData.description,
        author: courseData.author,
        dateCreated: new Date().toISOString(),
      },
      message: {
        protocol: "https://example.com/dudemy",
        protocolPath: "course",
        schema: "https://example.com/dudemy/schema1",
        dataFormat: "application/json",
        published: true,
      },
    };

    const result = await web5.dwn.records.create(record);
    console.log(await result.record.data.json());

    await result.record.send(myDid);
    console.log("Course created with ID:", result.record.id);
    let courseId = result.record.id;

    const fetchedRecord = await web5.dwn.records.read({
      message: {
        filter: {
          recordId: courseId,
        },
      },
    });
    const fetchedData = await fetchedRecord.record.data.json();
    console.log("Fetched course data:", fetchedData);

    document.getElementById("displayCourseID").innerText =
      "Created Course ID: " + result.record.id;

    document.getElementById("lessonUploadSection").style.display = "block";

    return result.record.id;
  } catch (error) {
    console.error("Error creating the course data:", error);
    throw error;
  }
}

// function to listen to the upload lesson button
async function handleLessonUpload() {
  try {
    const courseIdElement = document.getElementById("courseIdForLesson");
    const lessonTitleElement = document.getElementById("lessonTitle");
    const videoInputElement = document.getElementById("videoInput");

    const courseId = courseIdElement.value;
    const lessonTitle = lessonTitleElement.value;

    if (!courseId || !lessonTitle || !videoInputElement.files[0]) {
      alert("Please fill in all fields and select a video before uploading.");
      return;
    }

    const videoFile = videoInputElement.files[0];
    const videoBuffer = await new Blob([videoInputElement.files[0]], {
      type: "video/mp4",
    });

    const lessonData = {
      lessonTitle: lessonTitle,
    };

    await createCourseLesson(web5, courseId, lessonData, videoBuffer);

    lessonTitleElement.value = "";
    videoInputElement.value = "";

    alert("Lesson successfully uploaded!");
    if (selectedCourseId) {
      fetchAndDisplayLessons(selectedCourseId);
    }
  } catch (error) {
    console.error("Error handling lesson upload:", error);
    alert("Error uploading the lesson. Try again. 🙃");
  }
}

function toMicrosecondISOString(date) {
  let isoString = date.toISOString();
  return isoString.replace("Z", "000Z");
}

async function uploadVideo(web5, courseId, videoBuffer, message) {
  try {
    const record = {
      data: videoBuffer,
      message,
    };

    const result = await web5.dwn.records.create(record);
    console.log(result);

    await result.record.send(myDid);

    console.log("Video uploaded with ID:", result.record.id);
    return result.record.id;
  } catch (error) {
    console.error("Error uploading the video:", error);
    throw error;
  }
}

// create course lesson function:
async function createCourseLesson(web5, courseId, lessonData, videoBuffer) {
  try {
    if (!lessonData.lessonTitle || !videoBuffer) {
      throw new Error("Invalid lesson data");
    }

    const publishNow = document.getElementById("publishNow").checked;
    const publishDate = document.getElementById("publishDate").value;

    const contentRecord = {
      data: {
        title: lessonData.lessonTitle,
      },
      message: {
        protocol: "https://example.com/dudemy",
        protocolPath: "course/content",
        parentId: courseId,
        contextId: courseId,
        schema: "https://example.com/dudemy/schema2",
        dataFormat: "application/json",
        published: true,
      },
    };

    const result = await web5.dwn.records.create(contentRecord);
    const contentRecordId = result.record.id;

    let message = {
      protocol: "https://example.com/dudemy",
      protocolPath: "course/content/video",
      parentId: contentRecordId,
      contextId: courseId,
      schema: "https://example.com/dudemy/schema3",
      published: true,
      datePublished: publishNow
        ? toMicrosecondISOString(new Date())
        : toMicrosecondISOString(new Date(publishDate)),
    };

    const videoId = await uploadVideo(web5, courseId, videoBuffer, message);

    const { record } = await web5.dwn.records.read({
      message: {
        filter: {
          recordId: contentRecordId,
        },
      },
    });

    const updatedContentData = {
      videoId: videoId,
      lessonTitle: lessonData.lessonTitle,
    };
    await record.update({ data: updatedContentData });
    console.log("Updated content data:", updatedContentData);

    const updatedRecord = await web5.dwn.records.read({
      message: {
        filter: {
          recordId: contentRecordId,
        },
      },
    });

    const updatedData = await updatedRecord.record.data.json();
    console.log("New updated record:", updatedData);
  } catch (error) {
    console.error("Error adding lesson with video to the course:", error);
    throw error;
  }
}

//   fetch and display lessons(content) when clicked
async function fetchAndDisplayLessons(courseId) {
  console.log("Fetching lessons for courseId:", courseId);
  try {
    const queryOptions = {
      message: {
        filter: {
          protocol: "https://example.com/dudemy",
          schema: "https://example.com/dudemy/schema2",
          contextId: courseId,
        },
        limit: 3,
      },
    };

    const { records } = await web5.dwn.records.query(queryOptions);

    //get lesson data with recordID
    const lessons = await Promise.all(
      records.map(async (record) => {
        try {
          const { record: detailedRecord } = await web5.dwn.records.read({
            message: {
              filter: {
                recordId: record.id,
              },
            },
          });
          const lessonData = await detailedRecord.data.json();
          return {
            id: record.id,
            ...lessonData,
          };
        } catch (error) {
          console.error("Error reading lesson record:", error);
          return null;
        }
      })
    );

    const validLessons = lessons.filter((lesson) => lesson !== null);
    console.log("Fetched lessons:", validLessons);

    const lessonsSection = document.getElementById("lessonsSection");
    lessonsSection.style.display = "";

    displayLessons(validLessons);
  } catch (error) {
    console.error("Error fetching lessons:", error);
  }
}

//  display lessons
async function displayLessons(lessons) {
  const lessonListElement = document.getElementById("lessonList");
  lessonListElement.innerHTML = "";

  for (const lesson of lessons) {
    if (!lesson.videoId) {
      console.log("Skipping lesson with no videoId:", lesson);
      continue;
    }

    const lessonItem = document.createElement("li");
    const lessonTitle = document.createElement("h3");
    lessonTitle.textContent = lesson.lessonTitle;
    lessonItem.appendChild(lessonTitle);

    const videoPlayer = document.createElement("video");
    videoPlayer.setAttribute("controls", "");
    videoPlayer.style.width = "100%";

    const videoUrl = await resolveVideoUrl(lesson.videoId);
    if (videoUrl) {
      const videoSource = document.createElement("source");
      videoSource.setAttribute("src", videoUrl);
      videoSource.setAttribute("type", "video/mp4");
      videoPlayer.appendChild(videoSource);
      lessonItem.appendChild(videoPlayer);
    } else {
      console.error("Could not resolve video URL for videoId:", lesson.videoId);
    }

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete Lesson";
    deleteButton.addEventListener("click", () =>
      deleteLesson(lesson.id, selectedCourseId)
    );
    lessonItem.appendChild(deleteButton);

    lessonListElement.appendChild(lessonItem);
  }
}

//   get video url
async function resolveVideoUrl(videoId) {
  try {
    console.log("Attempting to resolve video URL for videoId:", videoId);

    const { record } = await web5.dwn.records.read({
      message: {
        filter: {
          recordId: videoId,
        },
      },
    });
    console.log("Fetched video record:", record);

    if (!record || !record.data) {
      console.error("Record or record data is undefined:", record);
      return null;
    }
    const videoData = await record.data.blob();
    console.log("Video data blob:", videoData);

    const videoUrl = URL.createObjectURL(videoData);
    console.log("Resolved video URL:", videoUrl);

    return videoUrl;
  } catch (error) {
    console.error("Error resolving video URL:", error);
    return null;
  }
}

//   delete lessons
async function deleteLesson(lessonId, courseId) {
  try {
    await web5.dwn.records.delete({ message: { recordId: lessonId } });

    if (courseId) {
      fetchAndDisplayLessons(courseId);
    } else {
      console.error("Current course ID is not set. Cannot refresh lessons.");
    }
  } catch (error) {
    console.error("Error deleting lesson:", error);
  }
}

// Function to display courses
function displayCourses(courses) {
  const courseDropdown = document.getElementById("courseDropdown");
  courseDropdown.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.textContent = "Select a course";
  defaultOption.value = "";
  courseDropdown.appendChild(defaultOption);

  courses.forEach((course) => {
    const option = document.createElement("option");
    option.textContent = `${course.title} - ${course.description}`;
    option.value = course.id;
    courseDropdown.appendChild(option);
  });

  courseDropdown.addEventListener("change", (event) => {
    selectedCourseId = event.target.value;
    fetchAndDisplayLessons(selectedCourseId);

    const courseIdInput = document.getElementById("courseIdForLesson");
    courseIdInput.value = selectedCourseId;

    const lessonUploadForm = document.getElementById("lessonUploadSection");
    lessonUploadForm.style.display = "block";
  });
}

function handleIssueCredentialClick() {
  alert("Button clicked");
}

// run dudemy
async function initPlatform() {
  try {
    document.getElementById("loadingIndicator").style.display = "block";

    const connection = await Web5.connect();
    web5 = connection.web5;
    myDid = connection.did;

    const courseProtocol = await configProtocol();

    console.log("starting with DID:", myDid);

    document.getElementById("loadingIndicator").style.display = "none";
    console.log("protocol:", courseProtocol);

    const courses = await fetchCoursesByInstructor();
    if (courses) {
      displayCourses(courses);
    }
  } catch (error) {
    console.error("Error initializing the platform:", error);
  }
}

document
  .getElementById("createCourseButton")
  .addEventListener("click", handleCourseCreation);
document
  .getElementById("lessonUploadButton")
  .addEventListener("click", handleLessonUpload);
document.getElementById("publishNow").addEventListener("change", function () {
  const publishDateInput = document.getElementById("publishDate");
  if (this.checked) {
    publishDateInput.disabled = true;
  } else {
    publishDateInput.disabled = false;
  }
});
document
  .getElementById("issueButton")
  .addEventListener("click", handleIssueCredentialClick);

window.onload = function () {
  initPlatform();
};
