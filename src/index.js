import { getTechPreviewDwnEndpoints, Web5 } from "@web5/api";
import { VerifiableCredential, PresentationExchange } from "@web5/credentials";
import {
  DidKeyMethod,
  utils as didUtils,
  DidIonMethod,
  DidResolverCacheLevel,
  DidResolver,
  DidDhtMethod,
} from "@web5/dids";
import { Ed25519, EdDsaAlgorithm } from "@web5/crypto";
import { Web5UserAgent } from "@web5/user-agent";
import { LevelStore } from "@web5/common";
import {
  DidManager,
  DidStoreDwn,
  DwnManager,
  IdentityManager,
  IdentityStoreDwn,
  LocalKms,
  KeyManager,
  KeyStoreDwn,
  PrivateKeyStoreDwn,
  AppDataVault,
  Web5RpcClient,
  SyncManagerLevel,
} from "@web5/agent";
import { IdentityAgent } from "@web5/identity-agent";
import { Buffer } from "buffer";
window.Buffer = Buffer;

let web5;
let existingDid;
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
  // console.log(existingDid, web5);
  const { protocol, status } = await web5.dwn.protocols.configure({
    message: {
      definition: protocolDefinition,
    },
  });
  await protocol.send(existingDid);
  return protocol;
}

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

async function createCourseData(web5, courseData) {
  try {
    if (!courseData.title || !courseData.description || !courseData.author) {
      throw new Error("Invalid course metadata");
    }
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

    await result.record.send(existingDid);
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

    document.getElementById("courseIdForLesson").value = courseId;

    document.getElementById("lessonUploadSection").style.display = "block";

    return result.record.id;
  } catch (error) {
    console.error("Error creating the course data:", error);
    throw error;
  }
}

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

    const videoBuffer = await new Blob([videoInputElement.files[0]], {
      type: "video/mp4",
    });

    const lessonData = { lessonTitle: lessonTitle };

    await createCourseLesson(web5, courseId, lessonData, videoBuffer);

    lessonTitleElement.value = "";
    videoInputElement.value = "";
    const filePathDisplay = videoInputElement
      .closest(".file-field")
      .querySelector(".file-path");
    if (filePathDisplay) {
      filePathDisplay.value = "";
    }

    // alert("Lesson successfully uploaded!");

    document.getElementById("courseCreationForm").style.display = "none";

    await fetchAndDisplayLessons(courseId);

    const lessonsSection = document.getElementById("lessonsSection");
    lessonsSection.style.display = "block";
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

    await result.record.send(existingDid);

    console.log("Video uploaded with ID:", result.record.id);
    return result.record.id;
  } catch (error) {
    console.error("Error uploading the video:", error);
    throw error;
  }
}

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
    // lessonItem.className = "fade-in";

    lessonListElement.appendChild(lessonItem);
  }
}

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

class TeacherCredentialData {
  constructor(name, email, role) {
    this.name = name;
    this.email = email;
    this.role = role;
  }
}

async function handleTeacherRegistration(event) {
  event.preventDefault();
  console.log("button clicked");

  try {
    const teacherName = document.getElementById("teacherName").value;
    const teacherEmail = document.getElementById("teacherEmail").value;

    if (!teacherName || !teacherEmail) {
      alert("Please enter your name and email.");
      return;
    }

    const issuerDid = await DidKeyMethod.create();
    const subjectDid = existingDid;

    const teacherData = new TeacherCredentialData(
      teacherName,
      teacherEmail,
      "Instructor"
    );

    console.log("Teacher Data:", teacherData);
    const teacherCredential = VerifiableCredential.create({
      type: "TeacherCredential",
      issuer: issuerDid.did,
      subject: subjectDid,
      data: teacherData,
    });

    console.log("Unsigned VC: \n " + teacherCredential.toString() + "\n");

    const { privateKeyJwk } = issuerDid.keySet.verificationMethodKeys[0];

    const signOptions = {
      issuerDid: issuerDid.did,
      subjectDid: subjectDid,
      kid: `${issuerDid.did}#${issuerDid.did.split(":")[2]}`,
      signer: async (data) => await Ed25519.sign({ data, key: privateKeyJwk }),
    };

    const signedVcJwt = await teacherCredential.sign(signOptions);
    console.log("\nSigned VC: \n" + signedVcJwt + "\n");

    sessionStorage.setItem("teacherCredential", signedVcJwt);

    const { record } = await web5.dwn.records.create({
      data: signedVcJwt,

      message: {
        schema: "TeacherCredential",
        dataFormat: "application/vc+jwt",
        published: true,
      },
    });

    try {
      const sendResult = await record.send(existingDid);
      console.log("Record sent successfully:", sendResult);
    } catch (error) {
      console.error("Error sending record:", error);
    }

    let { record: readRecord } = await web5.dwn.records.read({
      message: {
        filter: {
          recordId: record.id,
        },
      },
    });

    const readVcJwt = await readRecord.data.text();
    console.log("\nVC Record: \n" + readVcJwt + "\n");

    console.log("Finished!");

    console.log("Teacher registered with signed  VC:", signedVcJwt);
    await handleTeacherLogin(teacherCredential);
  } catch (error) {
    console.error("Error during teacher registration:", error);
  }
}

async function handleTeacherLogin() {
  try {
    let teacherCredential = sessionStorage.getItem("teacherCredential");

    if (!teacherCredential) {
      console.log("Querying DWN for teacher credential...");

      const teacherDid = existingDid;
      const response = await web5.dwn.records.query({
        from: teacherDid,
        message: {
          filter: {
            schema: "TeacherCredential",
            dataFormat: "application/vc+jwt",
          },
        },
      });

      if (!response || response.records.length === 0) {
        throw new Error("Teacher credential not found in DWN");
      }

      teacherCredential = await response.records[0].data.text();
      sessionStorage.setItem("teacherCredential", teacherCredential);
    }

    if (!teacherCredential) {
      throw new Error("Teacher credential not found");
    }

    await VerifiableCredential.verify(teacherCredential);
    console.log("Teacher credential verified. Login successful.");
    updateUIForLoggedInTeacher(teacherCredential);
  } catch (error) {
    console.error("Teacher credential verification failed:", error);
    const messageContainer = document.getElementById("messageContainer");
    messageContainer.innerText = "No account found, please register.";
    messageContainer.style.display = "block";
  }
}

function updateUIForLoggedInTeacher(teacherCredential) {
  const parsedVc = VerifiableCredential.parseJwt(teacherCredential);
  console.log("parsevc:", parsedVc);

  const teacherName = parsedVc.vcDataModel.credentialSubject.name;

  document.getElementById("loginButton").style.display = "none";
  document.getElementById("logoutButton").style.display = "block";
  document.getElementById("messageContainer").style.display = "none";

  const greetingElement = document.getElementById("greeting");
  if (greetingElement) {
    greetingElement.textContent = `Welcome, ${teacherName}!`;
  } else {
    const greeting = document.createElement("div");
    greeting.setAttribute("id", "greeting");
    greeting.textContent = `Welcome, ${teacherName}!`;
    document.body.insertBefore(greeting, document.body.firstChild);
  }

  document.getElementById("teacherRegistrationForm").style.display = "none";
  document.getElementById("courseSelection").style.display = "block";
  document.getElementById("courseCreationForm").style.display = "block";
}

function handleTeacherLogout() {
  sessionStorage.removeItem("teacherCredential");
  updateUIForLoggedOutTeacher();
}

function updateUIForLoggedOutTeacher() {
  document.getElementById("loginButton").style.display = "block";
  document.getElementById("logoutButton").style.display = "none";

  const greetingElement = document.getElementById("greeting");
  if (greetingElement) {
    greetingElement.remove();
  }

  document.getElementById("courseSelection").style.display = "none";
  document.getElementById("courseCreationForm").style.display = "none";
  document.getElementById("lessonUploadSection").style.display = "none";
  document.getElementById("lessonsSection").style.display = "none";
  document.getElementById("displayCourseID").style.display = "none";

  document.getElementById("teacherRegistrationForm").style.display = "block";
  window.location.reload();
}

async function resolveDid(didResolver, did) {
  try {
    const didDocument = await didResolver.resolve(did);
    console.log("DID Document:", didDocument);
    return didDocument;
  } catch (error) {
    console.error("Error resolving DID:", error);
    return null;
  }
}

async function initPlatform(passphrase) {
  try {
    document.getElementById("loadingIndicator").style.display = "block";
    const serviceEndpointNodes = await getTechPreviewDwnEndpoints();
    const didOptions = await DidIonMethod.generateDwnOptions({
      serviceEndpointNodes,
    });

    const didIon = await DidIonMethod.create(didOptions);

    existingDid = didIon.did;

    const appData = new AppDataVault({
      store: new LevelStore("data/agent/vault"),
    });

    const didManager = new DidManager({
      didMethods: [DidIonMethod, DidKeyMethod],
      store: new DidStoreDwn(),
    });

    const didResolver = new DidResolver({
      didResolvers: [DidIonMethod, DidKeyMethod],
    });

    const dwnManager = await DwnManager.create({ didResolver });

    const identityManager = new IdentityManager({
      store: new IdentityStoreDwn(),
    });

    const localKmsDwn = new LocalKms({
      kmsName: "local",
      keyStore: new KeyStoreDwn({
        schema: "https://identity.foundation/schemas/web5/kms-key",
      }),
      privateKeyStore: new PrivateKeyStoreDwn(),
    });

    const localKmsMemory = new LocalKms({
      kmsName: "memory",
    });

    const keyManager = new KeyManager({
      kms: {
        local: localKmsDwn,
        memory: localKmsMemory,
      },
      store: new KeyStoreDwn({
        schema: "https://identity.foundation/schemas/web5/managed-key",
      }),
    });

    const rpcClient = new Web5RpcClient();

    const syncManager = new SyncManagerLevel();

    const agentOptions = {
      agentDid: existingDid,
      appData,
      didManager,
      didResolver,
      dwnManager,
      identityManager,
      keyManager,
      rpcClient,
      syncManager,
    };

    const identityAgent = await IdentityAgent.create(agentOptions);
    await identityAgent.start({ passphrase });

    await didManager.import({
      did: didIon,
      kms: "local",
    });

    const web5Connection = await Web5.connect({
      connectedDid: existingDid,
      agent: identityAgent,
    });
    web5 = web5Connection.web5;

    // console.log("web5:", web5);

    const courseProtocol = await configProtocol();
    if (courseProtocol) {
      console.log("protocol:", courseProtocol);
    } else {
      console.log("Failed to configure protocol");
    }

    console.log("starting with DID:", existingDid);

    document.getElementById("loadingIndicator").style.display = "none";

    const courses = await fetchCoursesByInstructor();
    if (courses) {
      displayCourses(courses);
    }
  } catch (error) {
    console.error("Error initializing the platform:", error);
  }
}

document
  .getElementById("registerButton")
  .addEventListener("click", handleTeacherRegistration);

document
  .getElementById("loginButton")
  .addEventListener("click", handleTeacherLogin);
document
  .getElementById("logoutButton")
  .addEventListener("click", handleTeacherLogout);
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

window.onload = function () {
  const passphrase = "temp-passphrase";
  initPlatform(passphrase);
  // initPlatform();
  // handleTeacherLogin();
};
